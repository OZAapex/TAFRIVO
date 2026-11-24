-- TAFRIVO Smart Pager is an opt-in service managed by the sole super_admin.
-- Preserve accepted orders and WhatsApp checkout; disable new Smart Pager activations globally.
BEGIN;
ALTER TABLE public.pager_settings ALTER COLUMN enabled SET DEFAULT false;
UPDATE public.pager_settings SET enabled=false,updated_at=now() WHERE enabled IS DISTINCT FROM false;
DROP POLICY IF EXISTS pager_settings_owner ON public.pager_settings;
DROP POLICY IF EXISTS pager_settings_owner_read ON public.pager_settings;
DROP POLICY IF EXISTS pager_settings_admin_all ON public.pager_settings;
CREATE POLICY pager_settings_owner_read ON public.pager_settings
 FOR SELECT TO authenticated USING (
   EXISTS(SELECT 1 FROM public.restaurants r
     WHERE r.id=pager_settings.restaurant_id AND r.owner_id=(SELECT auth.uid()))
 );
CREATE POLICY pager_settings_admin_all ON public.pager_settings
 FOR ALL TO authenticated
 USING (
   EXISTS(SELECT 1 FROM public.account_profiles p
     WHERE p.user_id=(SELECT auth.uid()) AND p.role='super_admin')
 )
 WITH CHECK (
   EXISTS(SELECT 1 FROM public.account_profiles p
     WHERE p.user_id=(SELECT auth.uid()) AND p.role='super_admin')
 );
COMMIT;