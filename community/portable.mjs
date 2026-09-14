#!/usr/bin/env node
/**
 * Pack this host's working DeepSeek Harness deployment into one archive that a
 * clean, same-architecture Windows host runs with no preinstalled runtime, no
 * network, and no plugin or configuration work:
 *
 *   node community/portable.mjs check                 # is this host packable?
 *   node community/portable.mjs pack                  # write the archive
 *   node community/portable.mjs pack --dry-run        # report sizes only
 *
 * The implementation lives in `community/portable/`; this file keeps the
 * documented entry point. See `community/README.md` for what the archive
 * carries and what a target host must do (nothing beyond extracting it).
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import './portable/index.mjs'
