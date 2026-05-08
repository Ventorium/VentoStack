export type OpenAPIComponents = {
  schemas: never,
  responses: never,
  // parameters: {},
  // headers: {},
  requestBodies: never
}
export type OpenAPIs = {
  get: {
    '/health': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {}
    },
    '/health/live': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {}
    },
    '/health/ready': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {}
    },
    '/uploads/*': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/configs/public': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/passkey/list': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/users': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/users/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/roles': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/roles/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/menus': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/menus/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/menus/tree': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/depts': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/depts/tree': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/posts': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dict/types': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dict/types/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dict/types/:code/data': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/configs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/configs/by-key/:key': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notices': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/user/profile': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/user/routes': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/user/permissions': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/mfa/status': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/operation-logs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/login-logs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dashboard/stats': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/oss': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/oss/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/oss/:id/download': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/oss/:id/url': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/monitor/server': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/monitor/cache': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/monitor/datasource': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/monitor/health': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/monitor/online': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    }
  },
  post: {
    '/api/auth/login': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/register': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/forgot-password': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/reset-password': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/reset-password-by-token': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/refresh': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/mfa/login': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/logout': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/mfa/enable': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/mfa/verify': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/mfa/disable': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/passkey/login-begin': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/passkey/login-finish': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/passkey/register-begin': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/auth/passkey/register-finish': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/users': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/users/export': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/roles': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/menus': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/depts': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/posts': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dict/types': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/configs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notices': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/user/profile/avatar': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dict/data': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/oss/upload': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    }
  },
  delete: {
    '/api/auth/passkey/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/users/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/roles/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/menus/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/depts/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/posts/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dict/types/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/configs/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notices/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dict/data/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/login-logs': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/oss/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/monitor/online/:sessionId': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    }
  },
  put: {
    '/api/system/users/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/users/:id/reset-pwd': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/users/:id/status': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/roles/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/roles/:id/menus': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/roles/:id/data-scope': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/menus/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/depts/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/posts/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dict/types/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/configs/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notices/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notices/:id/publish': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notices/:id/read': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/user/profile': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/user/profile/password': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/dict/data/:id': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/notices/:id/revoke': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/users/:id/unlock': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/users/:id/blacklist': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    }
  }
}