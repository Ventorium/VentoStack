import { column, defineModel } from '@ventostack/database';

export const OAuthApplicationModel = defineModel(
  'oauth_application',
  {
    id: column.varchar({ primary: true, length: 36 }),
    identifier: column.varchar({ length: 64 }),
    name: column.varchar({ length: 128 }),
    description: column.varchar({ length: 512, nullable: true }),
    icon_url: column.varchar({ length: 2048, nullable: true }),
    icon_storage_path: column.varchar({ length: 2048, nullable: true }),
    icon_mime_type: column.varchar({ length: 64, nullable: true }),
    homepage_url: column.varchar({ length: 2048 }),
    redirect_uri: column.varchar({ length: 2048 }),
    post_logout_redirect_uri: column.varchar({ length: 2048, nullable: true }),
    backchannel_logout_uri: column.varchar({ length: 2048, nullable: true }),
    backchannel_logout_session_required: column.boolean({ default: true }),
    client_id: column.varchar({ length: 64 }),
    client_secret_digest: column.varchar({ length: 128 }),
    client_secret_version: column.int({ default: 1 }),
    allowed_scopes: column.text(),
    offline_access_enabled: column.boolean({ default: false }),
    enabled: column.boolean({ default: true }),
    sort: column.int({ default: 0 }),
    status: column.varchar({ length: 16, default: 'ACTIVE' }),
    deleted_at: column.timestamp({ nullable: true }),
  },
  { timestamps: true },
);

export const OAuthApplicationRoleGrantModel = defineModel('oauth_application_role_grant', {
  tenant_id: column.varchar({ primary: true, length: 36 }),
  application_id: column.varchar({ primary: true, length: 36 }),
  role_id: column.varchar({ primary: true, length: 36 }),
});

export const OAuthApplicationUserGrantModel = defineModel('oauth_application_user_grant', {
  tenant_id: column.varchar({ primary: true, length: 36 }),
  application_id: column.varchar({ primary: true, length: 36 }),
  user_id: column.varchar({ primary: true, length: 36 }),
});

export const OAuthApplicationDeptGrantModel = defineModel('oauth_application_dept_grant', {
  tenant_id: column.varchar({ primary: true, length: 36 }),
  application_id: column.varchar({ primary: true, length: 36 }),
  dept_id: column.varchar({ primary: true, length: 36 }),
  scope: column.varchar({ length: 32 }),
});
