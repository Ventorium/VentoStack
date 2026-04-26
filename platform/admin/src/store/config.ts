let config: { xxx: string; } | null = null

export async function fetchConfig() {
  return fetch('/_env')
    .then(resp => resp.json())
    .then(conf => {
      config = conf
    })
}

export function getConfig() {
  return config!
}
