import { Modal, Typography } from 'antd';

const { Title, Paragraph, Text } = Typography;

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs font-mono overflow-x-auto my-2 whitespace-pre-wrap">
      {children}
    </pre>
  );
}

export function IntegrationDocsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal title="应用接入文档" open={open} onCancel={onClose} footer={null} width={960}>
      <Typography>
        <Paragraph type="secondary">
          VentoStack 提供 OAuth 2.0 + OpenID Connect 统一认证。子应用以 <Text strong>BFF 机密客户端</Text>
          方式接入：浏览器只持有子应用自己的本地 Session，OAuth Access Token / Refresh Token / Client Secret
          只保存在子应用后端，不进入浏览器存储。
        </Paragraph>

        <Title level={5}>1. 注册应用</Title>
        <Paragraph>
          在上方点击「注册应用」，填写标识符、首页 URL、Redirect URI，勾选允许的 Scope。创建完成后会
          <Text strong>一次性</Text>展示 <Text code>clientSecret</Text>，请立即保存；遗失只能重新生成，旧
          Secret 会立即失效。Application 由平台管理员管理全局配置，租户管理员通过「访问授权」控制本租户内
          哪些角色 / 用户 / 部门可以使用该应用。
        </Paragraph>

        <Title level={5}>2. 自动发现（OIDC Discovery）</Title>
        <Paragraph>
          客户端必须从 Discovery 文档读取端点，不要硬编码。Issuer 固定为{' '}
          <Text code>{'<认证中心地址>/api/oauth'}</Text>：
        </Paragraph>
        <CodeBlock>{`GET <issuer>/.well-known/openid-configuration
GET /.well-known/oauth-authorization-server/api/oauth   # RFC 8414`}</CodeBlock>

        <Title level={5}>3. 发起授权请求（Authorization Code + PKCE S256）</Title>
        <Paragraph>
          子应用后端为每次登录生成 <Text code>state</Text>、<Text code>nonce</Text> 和 PKCE{' '}
          <Text code>code_verifier</Text>（43–128 位随机字符），并绑定到本地临时会话；浏览器跳转到授权端点：
        </Paragraph>
        <CodeBlock>{`GET <issuer>/authorize?
  response_type=code
  &client_id=<clientId>
  &redirect_uri=<注册时填写的 Redirect URI，精确匹配>
  &scope=openid profile context
  &state=<随机 state>
  &nonce=<随机 nonce>
  &code_challenge=<BASE64URL(SHA256(code_verifier))，无 = 填充>
  &code_challenge_method=S256`}</CodeBlock>
        <Paragraph>
          用户已有 SSO Session 时自动完成授权；否则跳转统一登录页完成密码 / MFA / Passkey 登录。请求中
          Scope 必须全部属于平台注册 Scope 且在该应用的允许范围内，否则整个请求返回{' '}
          <Text code>invalid_scope</Text>。
        </Paragraph>

        <Title level={5}>4. 换取 Token</Title>
        <Paragraph>
          回调后先校验并原子消费本地 <Text code>state</Text>、校验响应中的 <Text code>iss</Text>
          参数，再用 Authorization Code 换取 Token。客户端认证只支持 HTTP Basic（client_secret_basic）：
        </Paragraph>
        <CodeBlock>{`POST <issuer>/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(<clientId>:<clientSecret>)

grant_type=authorization_code
&code=<授权码，60 秒内一次性有效>
&redirect_uri=<与授权请求完全一致>
&code_verifier=<本地保存的 PKCE verifier>`}</CodeBlock>
        <Paragraph>
          成功响应包含 <Text code>access_token</Text>（RS256 JWT，默认 15 分钟）、
          <Text code>id_token</Text>（RS256 JWT，仅供登录会话使用，不能调用资源 API）和{' '}
          <Text code>scope</Text>。仅当应用开启「允许离线访问」且授权包含 <Text code>offline_access</Text>{' '}
          时才返回 <Text code>refresh_token</Text>（默认 7 天，轮换使用，重放将撤销整个 Token Family）。
        </Paragraph>

        <Title level={5}>5. 获取应用身份上下文</Title>
        <Paragraph>
          携带 Access Token 调用，返回当前用户在该应用下的角色、权限、菜单和部门（按 Scope 字段级返回）：
        </Paragraph>
        <CodeBlock>{`GET <issuer>/me/context
Authorization: Bearer <access_token>`}</CodeBlock>
        <CodeBlock>{`{
  "user": { "id": "...", "username": "...", "displayName": "...", "avatar": null },
  "application": { "id": "reconcile", "name": "智能对账", "icon": "..." },
  "roles": [], "permissions": [], "menus": [], "departments": []
}`}</CodeBlock>
        <Paragraph>字段返回规则：</Paragraph>
        <CodeBlock>{`profile            → user 标准身份字段
context            → 允许调用 /me/context（缺少时返回 403 insufficient_scope）
roles.read         → roles
departments.read   → departments（当前主部门及有效上级链）
permissions.read   → permissions
menus.read         → menus（仅当前应用 application_id 下的菜单树）`}</CodeBlock>

        <Title level={5}>6. 其他端点</Title>
        <CodeBlock>{`POST <issuer>/token         # grant_type=refresh_token 刷新（scope 只能缩小）
POST <issuer>/revoke       # 撤销 Token（RFC 7009，未知 Token 同样返回 200）
POST <issuer>/introspect   # Token  introspection（RFC 7662，active:false 不解释原因）
GET  <issuer>/userinfo     # OIDC UserInfo，sub 与 ID Token 一致
GET  <issuer>/jwks         # RS256 公钥，可本地验签 Access Token
GET/POST <issuer>/logout   # RP-Initiated 全局退出`}</CodeBlock>

        <Title level={5}>7. 全局退出</Title>
        <Paragraph>
          子应用引导浏览器访问 <Text code>{'<issuer>/logout?id_token_hint=<id_token>'}</Text>
          完成全局退出；认证中心销毁 SSO Session 与相关 Refresh Token，并向注册过「后端退出 URI」的应用
          异步投递 Back-Channel Logout Token。需要即时失效的高风险请求应调用 Introspection。
        </Paragraph>

        <Title level={5}>8. 安全要求</Title>
        <Paragraph>
          · Client Secret 只存子应用后端，禁止进入浏览器、日志、查询参数。{'\n'}·{' '}
          state / nonce / code_verifier 由子应用生成并绑定本地会话，回调时先本地校验再换 Code。{'\n'}·
          Redirect URI 必须与注册值逐字节精确匹配。{'\n'}· ID Token 不能用于调用资源 API；Access Token 校验
          iss / aud / 签名 / 过期。{'\n'}· 本地 JWKS 验签失败或收到未知 kid 时，受限刷新 JWKS 或调用
          Introspection。
        </Paragraph>

        <Paragraph type="secondary">
          完整可运行的 BFF 接入示例见仓库 <Text code>apps/oauth-bff-example</Text>。
        </Paragraph>
      </Typography>
    </Modal>
  );
}
