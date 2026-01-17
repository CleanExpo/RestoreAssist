declare module 'digitalocean' {
  export type DigitalOceanClient = any

  const digitalocean: {
    client: (token: string, options?: any) => DigitalOceanClient
  }

  export default digitalocean
}

