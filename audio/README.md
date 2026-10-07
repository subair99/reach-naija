# Voice clips

Voice notes are stitched from short recordings, so the assistant never speaks anything
it was not given. Record one clip per character, per language:

```
audio/en/   a.mp3 … z.mp3   0.mp3 … 9.mp3   intro.mp3 (optional)   pause.mp3 (optional)
audio/pcm/  same file names, recorded in Pidgin
```

- Say each letter or digit clearly, with little silence before or after.
- `intro` is the phrase before the code, e.g. "Your postcode is" / "Your postcode na".
- `pause` is a short gap between segments. If missing, 0.35 s of silence is used.
- `.mp3`, `.wav`, `.m4a` or `.ogg` all work, and formats can be mixed.
- About 40 clips per language; roughly an hour of recording for English and Pidgin together.

Generated notes are cached in `audio/out/` (one file per language and postcode).
Delete that folder after re-recording a clip.

If a clip is missing, the WhatsApp reply is still sent as text, and the server logs
which characters are missing.
