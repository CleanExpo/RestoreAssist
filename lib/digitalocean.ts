import digitalocean from 'digitalocean'

function getDigitalOceanToken(): string {
  const token =
    process.env.DIGITALOCEAN_ACCESS_TOKEN ||
    process.env.DO_API_TOKEN ||
    process.env.DIGITALOCEAN_TOKEN

  if (!token) {
    throw new Error(
      'DigitalOcean token not configured. Set DIGITALOCEAN_ACCESS_TOKEN (preferred) or DO_API_TOKEN.'
    )
  }

  return token
}

export function getDigitalOceanClient() {
  const token = getDigitalOceanToken()
  return digitalocean.client(token)
}

export async function getDigitalOceanAccount() {
  const client = getDigitalOceanClient()
  return client.account.get()
}

