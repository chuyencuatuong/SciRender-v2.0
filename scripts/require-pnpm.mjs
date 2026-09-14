/**
 * Guard: this workspace uses the `workspace:*` protocol, which npm and yarn
 * classic do not understand. Fail with a useful message instead of npm's
 * cryptic EUNSUPPORTEDPROTOCOL.
 */
const agent = process.env.npm_config_user_agent ?? '';
if (!agent.startsWith('pnpm')) {
  console.error(`
SciRender dùng pnpm workspaces.

  corepack enable          # Node 18+ đã có sẵn corepack
  pnpm install

Nếu không dùng được corepack:  npm i -g pnpm

Lý do: các package nội bộ được khai báo bằng giao thức "workspace:*", npm và
yarn classic không hiểu giao thức này.
`);
  process.exit(1);
}
