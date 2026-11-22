# Online play (experimental)

Run from this directory with Node 20 or newer:

```sh
npm ci
npm start
# Open http://localhost:8080/ on each device (or use the host's reachable address).
npm run test:online
```

The Node process serves the game and `/online` WebSockets from the same origin. A public deployment needs HTTPS/WSS; clients do not connect to localhost. `PORT` controls the listening port, default 8080. `GET /healthz` is a basic HTTP health check.

* **1v1 queue:** two players are paired. The visual lobby shows both players’ live map previews and votes. Both lock in a map vote; if they differ, the server picks one vote at random. The 10-second fighter-selection timer starts when both have voted. Valor is the default if no fighter is chosen in time. Leaving/disconnecting cancels the match for the other player.
* **Private rooms:** a six-character code admits up to four players. The host chooses the map and can start with two to four players; everyone can choose a fighter and color. The lobby shows connected player slots and broadcasts fighter, color, and host map changes to everyone. After a round, players can return to the same room from the results screen; the host can start again once everyone has returned. If the host leaves or disconnects at any point, the room closes. If another player leaves during a fight, the round ends and the remaining players return to the room.
* All players use their own **Player 1** controls (keyboard, gamepad, or touch). Escape or the pause button opens an online match menu with an option to leave. The match continues for everyone while the menu is open, and your inputs are neutralized. Online fights are free-for-all and three stock, with ordinary item spawns disabled. The host can toggle stage hazards in private rooms; queue matches keep hazards off. Stage-specific fruit can appear with hazards on. Results do not award local progression. Queue matches do not have a rematch room.

The Node server runs the existing combat engine in a headless VM at approximately 60 ticks per second and sends authoritative snapshots at approximately 30 Hz. Inputs are sent when they change, and brief presses are retained until a server tick. This avoids trusting clients for hits and avoids assuming that rendering or random number generation stays deterministic across browsers. Latency depends on distance and server load; there is currently no client-side prediction, lag compensation, reconnection, or automated multi-region matchmaking. Fighter audio events are not yet replicated. This is an early implementation, not a production-tested competitive netcode stack.

## Wasmer deployment status and requirements

For Wasmer's **node-base** repository import, use the Git repository root (the directory containing `SmashDuels/`). The root `package.json` targets Node 24, installs the production `ws` dependency, and provides the commands:

- Install: `npm ci`
- Build: `npm run build` (the checked-in game assets are already built; this is a no-op)
- Start: `npm start`

The server reads `PORT` when provided and binds to `0.0.0.0`; otherwise it uses port `8080`. Configure Wasmer's internal proxy port to match if the platform does not inject `PORT`. The browser and WebSocket endpoint use the same origin. Do not use a static-site preset: the Node server needs the checked-in `SmashDuels/game/`, `SmashDuels/server/`, and `SmashDuels/tools/harness.js` files at runtime. The nested `SmashDuels/package.json` also supports running from that directory locally.

Wasmer's [Node support](https://wasmer.io/posts/nodejs-support-in-wasmer-edge-beta) is beta and the [Edge docs](https://docs.wasmer.io/edge/learn/deployment-modes/) describe WebSocket application support as alpha/permission-dependent. [Edge instances are stateless, ephemeral, and autoscaled](https://docs.wasmer.io/edge/learn/apps/). This implementation stores the queue, rooms, and live simulation **in one process**, so multiple independent Edge instances or restarts will split/drop rooms. Merely placing shared room metadata in a database does not solve the single-owner live match problem.

**Do not assume this is production-ready on Wasmer Edge or enable multi-instance scaling for it.** An actual deployment requires a Wasmer account/namespace and confirmation from Wasmer that the chosen Node runtime supports long-lived WebSocket upgrades, `node:vm`, file access and one stable authoritative worker, with routing that sends all participants to that worker. Validate two real clients and worker restarts under the chosen configuration. If that cannot be guaranteed, host this Node process on a stateful WebSocket-capable service and serve the game through Wasmer with an explicitly configured secure relay URL, or implement shared matchmaking plus consistent routing to stateful match workers. No Wasmer deployment has been performed or verified here.
