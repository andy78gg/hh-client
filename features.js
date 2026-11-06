/**
 * What the browser supports, checked once before anything is downloaded. The loader uses it to
 * offer the builds that can run here (Fast needs JSPI, both need WebAssembly GC, Rust needs WebGPU),
 * and to explain a failure before the player waits through a download that can't run.
 */
import { supportsJspi } from "./jspi.js";

                                  
                                                                             
                           
                                                                                         
                         
     
                                                                                                
                                                               
     
                                        
                                                                                     
                           
                                                                                         
                           
 

/**
 * The smallest module that uses a GC type: the header, then a type section declaring one empty
 * struct (0x5f). Engines without the GC proposal reject the struct type form.
 */
// prettier-ignore
const WASM_GC_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // magic "\0asm"
  0x01, 0x00, 0x00, 0x00, // version 1
  0x01, 0x03, // type section, 3 bytes
  0x01, // one type
  0x5f, 0x00, // struct with no fields
]);

/** The parts of the global scope detection reads, so tests can supply their own. */
                               
                                                              
                                         
                                       
                                                      
                                                  
 

/** The part of `navigator.gpu` detection calls; TypeScript's DOM types don't have WebGPU yet. */
                          
                                     
 

/**
 * Async because only asking for an adapter tells: a browser can have `navigator.gpu` and no GPU it
 * will use (blocklisted drivers, software rendering off).
 */
export async function detectFeatures(scope               = globalThis)                           {
  return {
    wasmGc: supportsWasmGc(scope),
    jspi: supportsWasmGc(scope) && supportsJspi(scope),
    crossOriginIsolated: scope.crossOriginIsolated === true && scope.SharedArrayBuffer !== undefined,
    webgl2: supportsWebgl2(scope),
    webgpu: await supportsWebgpu(scope),
  };
}

async function supportsWebgpu(scope              )                   {
  const gpu = scope.navigator?.gpu;
  if (gpu === undefined) {
    return false;
  }
  let timer                                           ;
  try {
    // Bounded: an adapter request on a wedged GPU process can take seconds, and this is before the
    // player sees anything.
    const adapter = await Promise.race([
      gpu.requestAdapter(),
      new Promise      ((resolve) => {
        timer = setTimeout(() => {
          resolve(null);
        }, 2000);
      }),
    ]);
    return adapter !== null && adapter !== undefined;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function supportsWasmGc(scope              )          {
  try {
    return scope.WebAssembly?.validate(WASM_GC_PROBE) === true;
  } catch {
    // Some engines throw on unknown type forms instead of returning false.
    return false;
  }
}

function supportsWebgl2(scope              )          {
  if (scope.document === undefined) {
    return false;
  }
  const canvas = scope.document.createElement("canvas");
  // Released straight away: this only asks whether a context can exist.
  const context = canvas.getContext("webgl2");
  context?.getExtension("WEBGL_lose_context")?.loseContext();
  return context !== null;
}
