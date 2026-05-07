let config: Record<string, unknown> | null = null

export async function fetchConfig() {
  return fetch('/_env')
    .then(resp => resp.json())
    .then(conf => {
      config = conf
    })
}

export function getConfig(): Record<string, unknown> {
  return config!
}
