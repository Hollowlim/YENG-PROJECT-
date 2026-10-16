// Public browser configuration for CROWNNETIC's Supabase project.
// Publishable keys are intended for frontend use; database access is controlled by RLS.
// Never put a Supabase secret/service-role key or a Resend API key here.
export const supabasePublicConfig = {
  url: "https://sfcxzqtthmfmpakobrpa.supabase.co",
  publishableKey: "sb_publishable_rBZ-fbcqMeFUHjxJckjlww_FcLNbYNl",
};

// Supabase's built-in test mailer uses a confirmation link. Switch to "code"
// only after installing the {{ .Token }} template with your email provider.
export const emailVerificationMode = "link";
