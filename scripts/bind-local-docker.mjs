// Preserve container configuration and volumes, changing only published host IPs.
// Docker Desktop's named pipe is local; no daemon TCP endpoint is enabled.
import http from 'node:http';
const socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
function request(method, path, body, raw = false) {
  return new Promise((resolve, reject) => {
    const bytes =
      body === undefined
        ? undefined
        : Buffer.isBuffer(body)
          ? body
          : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        socketPath,
        path,
        method,
        headers: bytes
          ? {
              'Content-Type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json',
              'Content-Length': bytes.length,
            }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (x) => chunks.push(x));
        res.on('end', () => {
          const out = Buffer.concat(chunks);
          if (res.statusCode >= 400)
            return reject(new Error(`Docker ${method} ${path}: status ${res.statusCode}`));
          resolve(raw ? out : out.length ? JSON.parse(out) : null);
        });
      },
    );
    req.on('error', reject);
    req.end(bytes);
  });
}
for (const name of ['supabase_db_nirmaan', 'supabase_kong_nirmaan']) {
  const old = await request('GET', `/containers/${name}/json`);
  const bindings = old.HostConfig.PortBindings;
  if (
    Object.values(bindings)
      .flat()
      .every((b) => b.HostIp === '127.0.0.1')
  ) {
    console.log(`${name}: already localhost-only`);
    continue;
  }
  if (old.HostConfig.NetworkMode !== 'nirmaan-local')
    throw new Error('Unexpected network; refusing container replacement');
  // Kong's declarative configuration and local certificate were injected by the CLI.
  const archive = name.includes('kong')
    ? await request('GET', `/containers/${name}/archive?path=/home/kong`, undefined, true)
    : null;
  for (const values of Object.values(bindings)) for (const b of values) b.HostIp = '127.0.0.1';
  const network = old.NetworkSettings.Networks['nirmaan-local'];
  const config = {
    ...old.Config,
    HostConfig: { ...old.HostConfig, PortBindings: bindings },
    NetworkingConfig: { EndpointsConfig: { 'nirmaan-local': { Aliases: network.Aliases } } },
  };
  const backup = `${name}_before_local_binding`;
  await request('POST', `/containers/${name}/stop?t=20`);
  await request('POST', `/containers/${name}/rename?name=${backup}`);
  let created = false;
  try {
    await request('POST', `/containers/create?name=${name}`, config);
    created = true;
    if (archive) await request('PUT', `/containers/${name}/archive?path=/home`, archive);
    await request('POST', `/containers/${name}/start`);
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      const state = (await request('GET', `/containers/${name}/json`)).State;
      if (state.Health?.Status === 'healthy') {
        healthy = true;
        break;
      }
      if (!state.Running) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!healthy) throw new Error('Replacement did not become healthy');
    await request('DELETE', `/containers/${backup}`);
    console.log(`${name}: healthy; published ports now bind to 127.0.0.1`);
  } catch (error) {
    if (created) await request('DELETE', `/containers/${name}?force=true`);
    await request('POST', `/containers/${backup}/rename?name=${name}`);
    await request('POST', `/containers/${name}/start`);
    throw error;
  }
}
