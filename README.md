

```
 ████████╗███████╗██████╗ ███╗   ███╗███████╗███████╗████████╗
 ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝╚══██╔══╝
    ██║   █████╗  ██████╔╝██╔████╔██║█████╗  █████╗     ██║
    ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ██╔══╝     ██║
    ██║   ███████╗██║  ██║██║ ╚═╝ ██║███████╗███████╗   ██║
    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝   ╚═╝
```

**Meetings, but make them monospace.**

[npm](https://www.npmjs.com/package/termeet)
[License: MIT](LICENSE)

**Web → [termeet.app](https://termeet.app)**

---



Someone decided video calls needed more **grit** and fewer tabs. Termeet is what fell out: your camera becomes a living mosaic of `@` and `#`, your voice still gets through, and the whole thing runs where serious tools belong — **the terminal** (or the browser, if you prefer pixels with a glow-up).

No slick UI chrome. No “you’re on mute” in corporate pastel. Just you, your peers, and a grid of tiny ASCII faces trying their best.

```
  ┌──────────────────────────────────────────────────────┐
  │  @@@@@@@@   %%%%%%%%   ########                      │
  │  @@    @@   %%    %%   ##    ##   Participants: 3    │
  │  @ o  o @   % o  o %   # o  o #   Room: a7f3x       │
  │  @  __  @   %  __  %   #  __  #                      │
  │  @@@@@@@@   %%%%%%%%   ########   [M]ute  [V]ideo   │
  │                                   [T]chat [Q]uit    │
  │  > hey, can everyone see my screen?                  │
  │  > looks great in ASCII!                             │
  └──────────────────────────────────────────────────────┘
```

## The pitch

- **See each other** — as ASCII, in real time. It’s surprisingly expressive.
- **Hear each other** — when ffmpeg and your OS agree; bring **ffplay** if you want sound out of the speakers.
- **Talk in text** — side chat for links, jokes, and “can you hear me?” without the ritual.
- **Rooms with codes** — spin up a space, share the id, disappear when you’re done.

There’s also a **web client** at **[termeet.app](https://termeet.app)** — same rooms, same vibe, friendlier for guests who don’t live in `tmux`. Room links look like `https://termeet.app/r/<room-id>` so you can reload or share a meeting.

## Jump in (CLI)

```bash
npm install -g termeet
termeet
```

By default the CLI talks to the shared signal behind **[termeet.app](https://termeet.app)** (`wss://termeet.app/ws`). Self-hosting? Point the client at your own server with `TERMEET_WS_URL`, or `TERMEET_HOST` / `TERMEET_PORT` for a plain `ws://` box on your network.

The published npm package ships a **standalone binary** (Bun + bundled ffmpeg where we can). Optional **ffplay** is on you if your OS doesn’t bundle it — full ffmpeg installs usually include it.

## Hack on this repo

Grab **[Bun](https://bun.sh)** (one-liner on their site), **[ffmpeg](https://ffmpeg.org)** from your package manager, and optionally **ffplay** if you care about hearing remote audio.

```bash
bun install
bun run start    # server + terminal client, together
# or: bun run server   and   bun run dev   in two terminals
```

**macOS:** give your terminal app **Camera** and **Microphone** in *System Settings → Privacy & Security*, or you’ll stare at “No signal” forever.

## Keys (terminal client)


| Key      | What it does                         |
| -------- | ------------------------------------ |
| `M`      | Mute / unmute                        |
| `V`      | Camera on / off                      |
| `T`      | Chat panel                           |
| `I`      | Copy room id                         |
| `Tab`    | Hop between fields (lobby)           |
| `Esc`    | Back out / unfocus chat              |
| `Q`      | Leave room (meeting) or quit (lobby) |
| `Ctrl+Q` | Quit the app from a meeting          |
| `P`      | Clear pinned participant             |


## Under the hood (short version)

Camera frames take a scenic route through ffmpeg, get turned into something your font can love, and ride **WebSockets** to everyone else. Audio tags along as PCM when the stars align. The terminal UI is **[OpenTUI](https://opentui.com)** — React in the place you’d least expect.

If you’re packaging, publishing, or building the CLI for every platform, see `**bun run build:cli`** / `**build:cli:all**`, env vars like `FFMPEG_PATH`, and the workflow in `**.github/workflows/publish-packages.yml**`. The rest is ordinary TypeScript under `src/` — server, client, and shared protocol living in one tree.

## License

MIT — use it, break it, fork it, turn your standup into ASCII theatre.