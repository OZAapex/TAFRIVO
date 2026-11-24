-- Customer-controlled WhatsApp ready alerts. No number for users who did not opt in.
ALTER TABLE public.pager_orders
  ADD COLUMN IF NOT EXISTS ready_whatsapp_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ready_whatsapp text;
ALTER TABLE public.pager_orders
  ADD CONSTRAINT pager_ready_whatsapp_consent_check
  CHECK (
    (ready_whatsapp_consent = true AND ready_whatsapp ~ '^[1-9][0-9]{9,14}$')
    OR (ready_whatsapp_consent = false AND ready_whatsapp IS NULL)
  );

-- No public access to contact numbers. Existing owner-only RLS on pager_orders applies.
CREATE OR REPLACE FUNCTION public.pager_prepare_short_order(p_payload jsonb,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_rest uuid; v_ref uuid; v_issued timestamptz; v_kind text; v_table text; v_note text;
        v_lang text; v_line jsonb; v_item public.menu_items%ROWTYPE; v_item_id uuid; v_bread text; v_qty int;
        v_total_qty int:=0; v_total numeric:=0; v_key text; v_keys text[]:=ARRAY[]::text[];
        v_token_hash text; v_existing public.pager_pending_requests%ROWTYPE; v_code text;
BEGIN
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR length(p_payload::text)>6000
    OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'Invalid request'; END IF;
 BEGIN
  v_rest=(p_payload->>'restaurant_id')::uuid;
  v_ref=(p_payload->>'client_ref')::uuid;
  v_issued=to_timestamp((p_payload->>'issued_at')::double precision/1000);
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid order reference'; END;
 v_kind=p_payload->>'kind';
 v_table=nullif(btrim(coalesce(p_payload->>'table','')),'');
 v_note=btrim(coalesce(p_payload->>'note',''));
 -- Customer explicitly opts in to one order-ready WhatsApp message. Never infer a phone from the WhatsApp sender.
 IF coalesce((p_payload->>'ready_whatsapp_consent')::boolean,false) THEN
    IF coalesce(p_payload->>'ready_whatsapp','') !~ '^[1-9][0-9]{9,14}
 v_lang=coalesce(p_payload->>'lang','ar');
 IF v_rest IS NULL OR v_ref IS NULL OR v_issued IS NULL
 OR v_issued < now()-interval '10 minutes' OR v_issued > now()+interval '1 minute'
 OR v_kind NOT IN ('table','takeaway') OR v_lang NOT IN ('ar','he','en')
 OR (v_kind='table' AND (v_table IS NULL OR char_length(v_table)>32))
 OR (v_kind='takeaway' AND v_table IS NOT NULL)
 OR char_length(v_note)>240
 THEN RAISE EXCEPTION 'Invalid order details'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pager_settings s JOIN public.restaurants r ON r.id=s.restaurant_id
 WHERE s.restaurant_id=v_rest AND s.enabled AND r.status='approved' AND r.is_published)
 THEN RAISE EXCEPTION 'Smart Pager not available'; END IF;
 -- Prune short-lived request data once it is safely older than the confirmation window.
 DELETE FROM public.pager_pending_requests WHERE expires_at < now()-interval '1 day';
 v_token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 SELECT * INTO v_existing FROM public.pager_pending_requests
 WHERE client_ref=v_ref;
 IF FOUND THEN
   IF v_existing.restaurant_id<>v_rest OR v_existing.tracking_hash<>v_token_hash
      OR v_existing.payload<>p_payload THEN RAISE EXCEPTION 'Order reference already used'; END IF;
   IF v_existing.expires_at<now() THEN RAISE EXCEPTION 'Order link expired; start a new request'; END IF;
   RETURN jsonb_build_object('code',v_existing.confirmation_code,'client_ref',v_ref,'expires_at',v_existing.expires_at,'duplicate',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.pager_orders o WHERE o.client_ref=v_ref) THEN
   RAISE EXCEPTION 'Order already accepted'; END IF;
 IF (SELECT count(*) FROM public.pager_pending_requests p
     WHERE p.restaurant_id=v_rest AND p.created_at > now()-interval '10 minutes')>=120 THEN
   RAISE EXCEPTION 'Too many new requests; try later or use WhatsApp directly'; END IF;
 IF jsonb_typeof(p_payload->'lines')<>'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 12
 THEN RAISE EXCEPTION 'Invalid order lines'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
   IF jsonb_typeof(v_line)<>'object'
      OR coalesce(v_line->>'qty','') !~ '^[1-9][0-9]?$'
      OR coalesce(v_line->>'id','') !~ '^[0-9a-f-]{36}$'
   THEN RAISE EXCEPTION 'Invalid item'; END IF;
   v_qty=(v_line->>'qty')::int;
   IF v_qty>20 THEN RAISE EXCEPTION 'Quantity too large'; END IF;
   v_total_qty=v_total_qty+v_qty;
   IF v_total_qty>40 THEN RAISE EXCEPTION 'Order too large for Smart Pager'; END IF;
   v_bread=coalesce(v_line->>'option','');
   IF v_bread NOT IN ('','wrap','baguette') THEN RAISE EXCEPTION 'Invalid bread option'; END IF;
   BEGIN v_item_id=(v_line->>'id')::uuid;
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid item ID'; END;
   v_key=v_item_id::text || '/' || v_bread;
   IF v_key=ANY(v_keys) THEN RAISE EXCEPTION 'Repeated order line'; END IF;
   v_keys=array_append(v_keys,v_key);
   SELECT * INTO v_item FROM public.menu_items i
     WHERE i.id=v_item_id AND i.restaurant_id=v_rest AND i.is_visible AND i.is_available;
   IF NOT FOUND THEN RAISE EXCEPTION 'A dish is unavailable'; END IF;
   IF (v_item.bread_choices_enabled AND v_bread NOT IN ('wrap','baguette'))
      OR (NOT v_item.bread_choices_enabled AND v_bread<>'')
   THEN RAISE EXCEPTION 'Bread option mismatch'; END IF;
   v_total=v_total+v_qty*v_item.price_ils;
   IF v_total>3000 THEN RAISE EXCEPTION 'Order too large for Smart Pager'; END IF;
 END LOOP;
 v_code=upper(encode(extensions.gen_random_bytes(8),'hex'));
 INSERT INTO public.pager_pending_requests(restaurant_id,client_ref,confirmation_code,tracking_hash,payload)
 VALUES(v_rest,v_ref,v_code,v_token_hash,p_payload);
 RETURN jsonb_build_object('code',v_code,'client_ref',v_ref,'expires_at',now()+interval '10 minutes','duplicate',false);
END;
$$;

    THEN RAISE EXCEPTION 'Valid WhatsApp number required for notification'; END IF;
 ELSE
    IF nullif(coalesce(p_payload->>'ready_whatsapp',''),'') IS NOT NULL
    THEN RAISE EXCEPTION 'WhatsApp contact requires explicit opt-in'; END IF;
 END IF;
 v_lang=coalesce(p_payload->>'lang','ar');
 IF v_rest IS NULL OR v_ref IS NULL OR v_issued IS NULL
 OR v_issued < now()-interval '10 minutes' OR v_issued > now()+interval '1 minute'
 OR v_kind NOT IN ('table','takeaway') OR v_lang NOT IN ('ar','he','en')
 OR (v_kind='table' AND (v_table IS NULL OR char_length(v_table)>32))
 OR (v_kind='takeaway' AND v_table IS NOT NULL)
 OR char_length(v_note)>240
 THEN RAISE EXCEPTION 'Invalid order details'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pager_settings s JOIN public.restaurants r ON r.id=s.restaurant_id
 WHERE s.restaurant_id=v_rest AND s.enabled AND r.status='approved' AND r.is_published)
 THEN RAISE EXCEPTION 'Smart Pager not available'; END IF;
 -- Prune short-lived request data once it is safely older than the confirmation window.
 DELETE FROM public.pager_pending_requests WHERE expires_at < now()-interval '1 day';
 v_token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 SELECT * INTO v_existing FROM public.pager_pending_requests
 WHERE client_ref=v_ref;
 IF FOUND THEN
   IF v_existing.restaurant_id<>v_rest OR v_existing.tracking_hash<>v_token_hash
      OR v_existing.payload<>p_payload THEN RAISE EXCEPTION 'Order reference already used'; END IF;
   IF v_existing.expires_at<now() THEN RAISE EXCEPTION 'Order link expired; start a new request'; END IF;
   RETURN jsonb_build_object('code',v_existing.confirmation_code,'client_ref',v_ref,'expires_at',v_existing.expires_at,'duplicate',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.pager_orders o WHERE o.client_ref=v_ref) THEN
   RAISE EXCEPTION 'Order already accepted'; END IF;
 IF (SELECT count(*) FROM public.pager_pending_requests p
     WHERE p.restaurant_id=v_rest AND p.created_at > now()-interval '10 minutes')>=120 THEN
   RAISE EXCEPTION 'Too many new requests; try later or use WhatsApp directly'; END IF;
 IF jsonb_typeof(p_payload->'lines')<>'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 12
 THEN RAISE EXCEPTION 'Invalid order lines'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
   IF jsonb_typeof(v_line)<>'object'
      OR coalesce(v_line->>'qty','') !~ '^[1-9][0-9]?$'
      OR coalesce(v_line->>'id','') !~ '^[0-9a-f-]{36}$'
   THEN RAISE EXCEPTION 'Invalid item'; END IF;
   v_qty=(v_line->>'qty')::int;
   IF v_qty>20 THEN RAISE EXCEPTION 'Quantity too large'; END IF;
   v_total_qty=v_total_qty+v_qty;
   IF v_total_qty>40 THEN RAISE EXCEPTION 'Order too large for Smart Pager'; END IF;
   v_bread=coalesce(v_line->>'option','');
   IF v_bread NOT IN ('','wrap','baguette') THEN RAISE EXCEPTION 'Invalid bread option'; END IF;
   BEGIN v_item_id=(v_line->>'id')::uuid;
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid item ID'; END;
   v_key=v_item_id::text || '/' || v_bread;
   IF v_key=ANY(v_keys) THEN RAISE EXCEPTION 'Repeated order line'; END IF;
   v_keys=array_append(v_keys,v_key);
   SELECT * INTO v_item FROM public.menu_items i
     WHERE i.id=v_item_id AND i.restaurant_id=v_rest AND i.is_visible AND i.is_available;
   IF NOT FOUND THEN RAISE EXCEPTION 'A dish is unavailable'; END IF;
   IF (v_item.bread_choices_enabled AND v_bread NOT IN ('wrap','baguette'))
      OR (NOT v_item.bread_choices_enabled AND v_bread<>'')
   THEN RAISE EXCEPTION 'Bread option mismatch'; END IF;
   v_total=v_total+v_qty*v_item.price_ils;
   IF v_total>3000 THEN RAISE EXCEPTION 'Order too large for Smart Pager'; END IF;
 END LOOP;
 v_code=upper(encode(extensions.gen_random_bytes(8),'hex'));
 INSERT INTO public.pager_pending_requests(restaurant_id,client_ref,confirmation_code,tracking_hash,payload)
 VALUES(v_rest,v_ref,v_code,v_token_hash,p_payload);
 RETURN jsonb_build_object('code',v_code,'client_ref',v_ref,'expires_at',now()+interval '10 minutes','duplicate',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.pager_accept_short_order(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_request public.pager_pending_requests%ROWTYPE; v_rest public.restaurants%ROWTYPE;
        v_order uuid; v_line jsonb; v_item public.menu_items%ROWTYPE; v_item_id uuid;
        v_bread text; v_qty int; v_total numeric:=0; v_total_qty int:=0; v_kind text; v_table text;
        v_lang text; v_note text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_code IS NULL OR p_code !~ '^[0-9A-F]{16}$' THEN RAISE EXCEPTION 'Invalid confirmation code'; END IF;
 SELECT * INTO v_request FROM public.pager_pending_requests WHERE confirmation_code=p_code FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order link not found'; END IF;
 SELECT * INTO v_rest FROM public.restaurants r WHERE r.id=v_request.restaurant_id AND r.status='approved'
 AND (r.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.account_profiles a WHERE a.user_id=auth.uid() AND a.role='super_admin'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF v_request.confirmed_order_id IS NOT NULL THEN
   RETURN jsonb_build_object('order_id',v_request.confirmed_order_id,'duplicate',true);
 END IF;
 IF v_request.expires_at<now() THEN RAISE EXCEPTION 'Confirmation expired'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pager_settings s WHERE s.restaurant_id=v_request.restaurant_id AND s.enabled)
 THEN RAISE EXCEPTION 'Smart Pager disabled'; END IF;
 v_kind=v_request.payload->>'kind';
 v_table=nullif(btrim(coalesce(v_request.payload->>'table','')),'');
 v_note=left(btrim(coalesce(v_request.payload->>'note','')),240);
 v_lang=coalesce(v_request.payload->>'lang','ar');
 IF v_kind NOT IN ('table','takeaway') OR v_lang NOT IN ('ar','he','en') THEN RAISE EXCEPTION 'Invalid order'; END IF;
 INSERT INTO public.pager_orders(restaurant_id,client_ref,tracking_hash,order_type,table_no,note,language,accepted_by,ready_whatsapp_consent,ready_whatsapp)
 VALUES(v_request.restaurant_id,v_request.client_ref,v_request.tracking_hash,v_kind,
 CASE WHEN v_kind='table' THEN v_table ELSE NULL END,v_note,v_lang,auth.uid(),
 coalesce((v_request.payload->>'ready_whatsapp_consent')::boolean,false),
 CASE WHEN coalesce((v_request.payload->>'ready_whatsapp_consent')::boolean,false)
      THEN nullif(v_request.payload->>'ready_whatsapp','') ELSE NULL END)
 RETURNING id INTO v_order;
 FOR v_line IN SELECT value FROM jsonb_array_elements(v_request.payload->'lines') LOOP
   v_item_id=(v_line->>'id')::uuid; v_qty=(v_line->>'qty')::int; v_bread=coalesce(v_line->>'option','');
   v_total_qty=v_total_qty+v_qty;
   IF v_qty NOT BETWEEN 1 AND 20 OR v_total_qty>40 THEN RAISE EXCEPTION 'Order too large'; END IF;
   SELECT * INTO v_item FROM public.menu_items WHERE id=v_item_id AND restaurant_id=v_request.restaurant_id AND is_available AND is_visible;
   IF NOT FOUND THEN RAISE EXCEPTION 'Dish unavailable'; END IF;
   IF (v_item.bread_choices_enabled AND v_bread NOT IN ('wrap','baguette'))
      OR (NOT v_item.bread_choices_enabled AND v_bread<>'')
   THEN RAISE EXCEPTION 'Invalid bread option'; END IF;
   INSERT INTO public.pager_order_items(order_id,menu_item_id,name,bread_option,quantity,unit_price_ils)
   VALUES(v_order,v_item_id,left(coalesce(nullif(v_item.name_ar,''),nullif(v_item.name_he,''),nullif(v_item.name_en,''),'Dish'),200),
     v_bread,v_qty,v_item.price_ils);
   v_total=v_total+v_qty*v_item.price_ils;
   IF v_total>3000 THEN RAISE EXCEPTION 'Order too large'; END IF;
 END LOOP;
 UPDATE public.pager_orders SET subtotal_ils=v_total WHERE id=v_order;
 INSERT INTO public.pager_order_events(order_id,actor_id,old_status,new_status) VALUES(v_order,auth.uid(),null,'accepted');
 UPDATE public.pager_pending_requests SET confirmed_at=now(),confirmed_order_id=v_order WHERE id=v_request.id;
 RETURN jsonb_build_object('order_id',v_order,'duplicate',false,'total',v_total);
END;
$$;

