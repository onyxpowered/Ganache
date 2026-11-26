# AeronX

Mirror your whole screen and sound to any device. Same transport as Aeron: frames and audio travel through Firebase Realtime Database, striped across every working shard.

## Use it

1. Open AeronX on the computer you want to mirror.
2. Connect → **Allow** screen recording (macOS asks once, then relaunch the app).
3. Connect → **Save file** to get `AeronX.html`. It is tied to this computer.
4. Open that file in any browser on any device and tap **Connect**.
5. Connect → **Start mirroring** on the computer.

Closing the window keeps AeronX running from the menu bar or tray. Quit it from there. While mirroring, the display stays awake.

## Develop

```
npm install
npm run dev
npm run build -- --mac
npm run build -- --win
```

`npm run forge` rebuilds the receiver template (`main/Template.js`). `npm run dev` and `npm run build` run it for you.

## Shards

Each shard is a Firebase project listed in `renderer/Uni/Shards.json` (public web config only). A shard works once Realtime Database exists and Anonymous sign-in is on. Deploy `Rules.json` to every shard:

```
firebase deploy --only database --project <project id>
```

## Notes

- Quality is fixed at 1366 × 768.
- Builds are unsigned. On macOS, right-click the app and choose Open the first time.
- Input (keys, mouse) is not sent.
