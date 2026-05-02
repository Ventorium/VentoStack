export type OpenAPIComponents = {
  schemas: never,
  responses: never,
  // parameters: {},
  // headers: {},
  requestBodies: never
}
export type OpenAPIs = {
  post: {
    '/api/auth/login': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/auth/register': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/auth/forgot-password': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/auth/reset-password': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/auth/refresh': {
      query: never,
      params: never,
      headers: never,
      body: any,
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
      body: any,
      response: any
    },
    '/api/auth/mfa/verify': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/auth/mfa/disable': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/users': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/roles': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/menus': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/depts': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/posts': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/dict/types': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/configs': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/notices': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/dict/data': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    }
  },
  get: {
    '/api/system/users': {
      query: any,
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
      query: any,
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
      query: any,
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
      query: any,
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
    '/api/system/depts/tree': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/posts': {
      query: any,
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
    '/api/system/dict/types': {
      query: any,
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
      query: any,
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
    '/api/system/notices': {
      query: any,
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
    '/api/system/operation-logs': {
      query: any,
      params: never,
      headers: never,
      body: never,
      response: any
    },
    '/api/system/login-logs': {
      query: any,
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
    }
  },
  put: {
    '/api/system/users/:id': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/users/:id/reset-pwd': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/users/:id/status': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/roles/:id': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/menus/:id': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/depts/:id': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/posts/:id': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/dict/types/:id': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/configs/:id': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/notices/:id': {
      query: never,
      params: never,
      headers: never,
      body: any,
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
      body: any,
      response: any
    },
    '/api/system/dict/data/:id': {
      query: never,
      params: never,
      headers: never,
      body: any,
      response: any
    },
    '/api/system/notices/:id/revoke': {
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
      body: any,
      response: any
    }
  },
  delete: {
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
    }
  }
}
