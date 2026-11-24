
-- Smart Pager: orders only exist after authenticated restaurant staff imports the WhatsApp message.
CREATE TABLE IF NOT EXISTS public.pager_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pager_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  client_ref uuid NOT NULL,
  tracking_hash text NOT NULL CHECK(tracking_hash ~ '^[0-9a-f]{64}$'),
  order_type text NOT NULL CHECK(order_type IN ('table','takeaway')),
  table_no text CHECK (table_no IS NULL OR char_length(table_no) BETWEEN 1 AND 32),
  note text NOT NULL DEFAULT '' CHECK(char_length(note)<=240),
  language text NOT NULL DEFAULT 'ar' CHECK(language IN ('ar','he','en')),
  subtotal_ils numeric(12,2) NOT NULL DEFAULT 0 CHECK(subtotal_ils>=0),
  status text NOT NULL DEFAULT 'accepted' CHECK(status IN ('accepted','preparing','ready','collected','cancelled')),
  accepted_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id,client_ref),
  CHECK ((order_type='table' AND table_no IS NOT NULL) OR (order_type='takeaway' AND table_no IS NULL))
);
CREATE INDEX IF NOT EXISTS pager_orders_restaurant_recent ON public.pager_orders(restaurant_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pager_orders_ref_unique ON public.pager_orders(client_ref);
CREATE TABLE IF NOT EXISTS public.pager_order_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.pager_orders(id) ON DELETE CASCADE,
  menu_item_id uuid,
  name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 200),
  bread_option text NOT NULL DEFAULT '' CHECK(bread_option IN ('','wrap','baguette')),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  unit_price_ils numeric(12,2) NOT NULL CHECK(unit_price_ils >= 0),
  UNIQUE(order_id,menu_item_id,bread_option)
);
CREATE INDEX IF NOT EXISTS pager_order_items_order_idx ON public.pager_order_items(order_id);
CREATE TABLE IF NOT EXISTS public.pager_order_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES public.pager_orders(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 old_status text,
 new_status text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pager_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pager_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pager_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pager_order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pager_settings,public.pager_orders,public.pager_order_items,public.pager_order_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pager_settings TO anon;
GRANT SELECT,INSERT,UPDATE ON public.pager_settings TO authenticated;
GRANT SELECT ON public.pager_orders,public.pager_order_items,public.pager_order_events TO authenticated;
CREATE POLICY pager_settings_public ON public.pager_settings FOR SELECT TO anon,authenticated USING (
 enabled AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND r.status='approved' AND r.is_published)
);
CREATE POLICY pager_settings_owner ON public.pager_settings FOR ALL TO authenticated USING (
 EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND (r.owner_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.account_profiles a WHERE a.user_id=(SELECT auth.uid()) AND a.role='super_admin')))
) WITH CHECK (
 EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND (r.owner_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.account_profiles a WHERE a.user_id=(SELECT auth.uid()) AND a.role='super_admin')))
);
CREATE POLICY pager_orders_owner ON public.pager_orders FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND (r.owner_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.account_profiles a WHERE a.user_id=(SELECT auth.uid()) AND a.role='super_admin')))
);
CREATE POLICY pager_items_owner ON public.pager_order_items FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.pager_orders o JOIN public.restaurants r ON r.id=o.restaurant_id WHERE o.id=order_id AND (r.owner_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.account_profiles a WHERE a.user_id=(SELECT auth.uid()) AND a.role='super_admin')))
);
CREATE POLICY pager_events_owner ON public.pager_order_events FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.pager_orders o JOIN public.restaurants r ON r.id=o.restaurant_id WHERE o.id=order_id AND (r.owner_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.account_profiles a WHERE a.user_id=(SELECT auth.uid()) AND a.role='super_admin')))
);

CREATE OR REPLACE FUNCTION public.pager_accept_from_whatsapp(p_payload jsonb,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_id uuid; v_rest uuid; v_ref uuid; v_issued timestamptz; v_kind text; v_table text; v_note text;
        v_lang text; v_line jsonb; v_item public.menu_items%ROWTYPE; v_item_id uuid; v_bread text;
        v_qty integer; v_count integer:=0; v_total_qty integer:=0; v_total numeric:=0;
        v_created uuid; v_name text; v_enabled boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR length(p_payload::text)>6000
   OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid WhatsApp request'; END IF;
 BEGIN
   v_rest=(p_payload->>'restaurant_id')::uuid;
   v_ref=(p_payload->>'client_ref')::uuid;
   v_issued=to_timestamp((p_payload->>'issued_at')::double precision/1000);
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid request identification'; END;
 v_kind=p_payload->>'kind';
 v_table=nullif(btrim(coalesce(p_payload->>'table','')),'');
 v_note=left(btrim(coalesce(p_payload->>'note','')),240);
 v_lang=coalesce(p_payload->>'lang','ar');
 IF v_kind NOT IN ('table','takeaway') OR v_lang NOT IN ('ar','he','en')
 OR (v_kind='table' AND (v_table IS NULL OR char_length(v_table)>32))
 OR (v_kind='takeaway' AND v_table IS NOT NULL)
 OR char_length(coalesce(p_payload->>'note',''))>240
 OR v_issued < now()-interval '10 minutes' OR v_issued > now()+interval '1 minute'
 THEN RAISE EXCEPTION 'Request invalid or expired (10 minutes)'; END IF;
 SELECT s.enabled INTO v_enabled FROM public.pager_settings s
 JOIN public.restaurants r ON r.id=s.restaurant_id
 WHERE r.id=v_rest AND r.status='approved' AND r.is_published
 AND (r.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.account_profiles a WHERE a.user_id=auth.uid() AND a.role='super_admin'));
 IF v_enabled IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Smart Pager is disabled or not authorized'; END IF;
 SELECT id INTO v_id FROM public.pager_orders WHERE client_ref=v_ref;
 IF v_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.pager_orders o WHERE o.id=v_id AND o.restaurant_id=v_rest AND o.tracking_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) THEN
     RAISE EXCEPTION 'Order reference already used';
   END IF;
   RETURN jsonb_build_object('id',v_id,'duplicate',true);
 END IF;
 IF jsonb_typeof(p_payload->'lines')<>'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 12
 THEN RAISE EXCEPTION 'Invalid order lines'; END IF;
 INSERT INTO public.pager_orders(restaurant_id,client_ref,tracking_hash,order_type,table_no,note,language,accepted_by)
 VALUES(v_rest,v_ref,encode(sha256(convert_to(p_token,'UTF8')),'hex'),v_kind,v_table,v_note,v_lang,auth.uid())
 RETURNING id INTO v_created;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
   IF jsonb_typeof(v_line)<>'object'
      OR coalesce(v_line->>'qty','') !~ '^[1-9][0-9]?$'
      OR coalesce(v_line->>'id','') !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Invalid item in order'; END IF;
   v_qty=(v_line->>'qty')::integer;
   IF v_qty>20 THEN RAISE EXCEPTION 'Too many of one item'; END IF;
   v_count=v_count+1;v_total_qty=v_total_qty+v_qty;
   IF v_total_qty>40 THEN RAISE EXCEPTION 'Order requires manual handling'; END IF;
   v_bread=coalesce(v_line->>'option','');
   IF v_bread NOT IN ('','wrap','baguette') THEN RAISE EXCEPTION 'Invalid bread option'; END IF;
   BEGIN v_item_id=(v_line->>'id')::uuid;
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid menu item ID'; END;
   SELECT * INTO v_item FROM public.menu_items i
   WHERE i.id=v_item_id AND i.restaurant_id=v_rest AND i.is_visible AND i.is_available;
   IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable dish in request'; END IF;
   IF (v_item.bread_choices_enabled AND v_bread NOT IN ('wrap','baguette'))
      OR (NOT v_item.bread_choices_enabled AND v_bread<>'') THEN
       RAISE EXCEPTION 'Bread selection mismatch'; END IF;
   v_name=left(coalesce(nullif(v_item.name_ar,''),nullif(v_item.name_he,''),nullif(v_item.name_en,''),'Dish'),200);
   INSERT INTO public.pager_order_items(order_id,menu_item_id,name,bread_option,quantity,unit_price_ils)
   VALUES(v_created,v_item_id,v_name,v_bread,v_qty,v_item.price_ils);
   v_total=v_total+v_qty*v_item.price_ils;
   IF v_total>3000 THEN RAISE EXCEPTION 'Order too large for Smart Pager'; END IF;
 END LOOP;
 UPDATE public.pager_orders SET subtotal_ils=v_total WHERE id=v_created;
 INSERT INTO public.pager_order_events(order_id,actor_id,old_status,new_status)
 VALUES(v_created,auth.uid(),null,'accepted');
 RETURN jsonb_build_object('id',v_created,'duplicate',false,'total',v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.pager_accept_from_whatsapp(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_accept_from_whatsapp(jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pager_set_status(p_order_id uuid,p_new_status text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_old text;v_rest uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT status,restaurant_id INTO v_old,v_rest FROM public.pager_orders WHERE id=p_order_id FOR UPDATE;
 IF v_old IS NULL THEN RAISE EXCEPTION 'Order missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurants r
   WHERE r.id=v_rest AND r.status='approved'
   AND (r.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.account_profiles a WHERE a.user_id=auth.uid() AND a.role='super_admin')))
 THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT ((v_old='accepted' AND p_new_status IN ('preparing','cancelled'))
  OR (v_old='preparing' AND p_new_status IN ('ready','cancelled'))
  OR (v_old='ready' AND p_new_status IN ('collected','cancelled')))
 THEN RAISE EXCEPTION 'Invalid status transition'; END IF;
 UPDATE public.pager_orders SET status=p_new_status,updated_at=now() WHERE id=p_order_id;
 INSERT INTO public.pager_order_events(order_id,actor_id,old_status,new_status)
 VALUES(p_order_id,auth.uid(),v_old,p_new_status);
 RETURN p_new_status;
END;
$$;
REVOKE ALL ON FUNCTION public.pager_set_status(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_set_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pager_get_tracking(p_client_ref uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_order public.pager_orders%ROWTYPE; v_name text; v_items jsonb;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_client_ref IS NULL THEN
   RETURN jsonb_build_object('found',false);
 END IF;
 SELECT * INTO v_order FROM public.pager_orders WHERE client_ref=p_client_ref
 AND tracking_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
 SELECT name INTO v_name FROM public.restaurants WHERE id=v_order.restaurant_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',i.name,'qty',i.quantity,'bread',i.bread_option,'price',i.unit_price_ils) ORDER BY i.id),'[]'::jsonb)
 INTO v_items FROM public.pager_order_items i WHERE i.order_id=v_order.id;
 RETURN jsonb_build_object('found',true,'restaurant_name',v_name,'status',v_order.status,
 'kind',v_order.order_type,'table',v_order.table_no,'total',v_order.subtotal_ils,
 'created_at',v_order.created_at,'updated_at',v_order.updated_at,'items',v_items);
END;
$$;
REVOKE ALL ON FUNCTION public.pager_get_tracking(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_get_tracking(uuid,text) TO anon,authenticated;

INSERT INTO public.pager_settings(restaurant_id,enabled)
SELECT id,true FROM public.restaurants WHERE slug='las-vegas' AND status='approved'
ON CONFLICT(restaurant_id) DO NOTHING;
