





























import { WASI } from 'node:wasi';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default async function Module(opts = {}) {
  const wasmBinary = opts.wasmBinary ?? fs.readFileSync(path.join(here, 'pascal.wasm'));
  
  const rtlDir = opts.rtlDir ?? path.join(here, 'rtl', 'units', 'wasm32-wasip1');
  const print = opts.print ?? null;
  const printErr = opts.printErr ?? null;

  const compiled = await WebAssembly.compile(wasmBinary);

  
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pascal-wasm-'));
  const rtlDst = path.join(scratch, 'rtl', 'units', 'wasm32-wasip1');
  fs.mkdirSync(rtlDst, { recursive: true });
  fs.cpSync(rtlDir, rtlDst, { recursive: true });
  fs.mkdirSync(path.join(scratch, 'work'), { recursive: true });

  
  const RTL_UNIT_PATH = '/rtl/units/wasm32-wasip1';

  const guestToHost = (p) => path.join(scratch, p.replace(/^\/+/, ''));

  const FS = {
    writeFile(p, data) {
      const host = guestToHost(p);
      fs.mkdirSync(path.dirname(host), { recursive: true });
      fs.writeFileSync(host, data);
    },
    readFile(p) { return fs.readFileSync(guestToHost(p)); },
    exists(p) { return fs.existsSync(guestToHost(p)); },
    unlink(p) { try { fs.unlinkSync(guestToHost(p)); } catch { /* ignore */ } },
    rtlUnitPath: RTL_UNIT_PATH,
    scratch,
  };

  // Instantiate `mod` fresh under WASI, capture stdout/stderr, return exit code.
  async function exec(mod, argv, env) {
    const outPath = path.join(scratch, '.stdout');
    const errPath = path.join(scratch, '.stderr');
    const outFd = fs.openSync(outPath, 'w');
    const errFd = fs.openSync(errPath, 'w');
    let code;
    try {
      const wasi = new WASI({
        version: 'preview1',
        args: argv,
        env: env ?? {},
        preopens: { '/': scratch },
        stdout: outFd,
        stderr: errFd,
        returnOnExit: true,
      });
      const instance = await WebAssembly.instantiate(mod, wasi.getImportObject());
      code = wasi.start(instance);
    } finally {
      fs.closeSync(outFd);
      fs.closeSync(errFd);
    }
    const out = fs.readFileSync(outPath, 'utf8');
    const err = fs.readFileSync(errPath, 'utf8');
    const emit = (cb, text) => {
      if (!cb || !text) return;
      const lines = text.split('\n');
      if (lines.at(-1) === '') lines.pop();
      for (const l of lines) cb(l);
    };
    emit(print, out);
    emit(printErr, err);
    return { code, stdout: out, stderr: err };
  }

  // Run the FPC compiler. `args` is the compiler's argv (without argv[0]).
  async function callMain(args, runOpts = {}) {
    const r = await exec(compiled, ['pascal', ...args], runOpts.env);
    return r.code;
  }

  
  
  async function run(guestWasmPath, runOpts = {}) {
    const bytes = FS.readFile(guestWasmPath);
    const mod = await WebAssembly.compile(bytes);
    const name = path.basename(guestWasmPath);
    return exec(mod, [name, ...(runOpts.args ?? [])], runOpts.env);
  }

  function destroy() { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {  } }

  return { callMain, run, FS, destroy };
}
