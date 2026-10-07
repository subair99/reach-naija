// Creates the demo Ed25519 signing key pair in keys/ (the server also does this on first start).
import { ensureKeys, publicKeyInfo } from "../server/src/arrival/sign.ts";
ensureKeys();
console.log(`Signing key ready. keyId=${publicKeyInfo().keyId}`);
