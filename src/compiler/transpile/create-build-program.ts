import type * as d from '../../declarations';
import { getTsOptionsToExtend } from './ts-config';
import { GENERATED_DTS } from '../output-targets/output-utils';
import ts from 'typescript';

/**
 *
 * @param config
 * @param buildCallback
 * @returns
 */
export const createTsBuildProgram = async (
  config: d.Config,
  buildCallback: (tsBuilder: ts.BuilderProgram) => Promise<void>
) => {
  console.trace(`src/compiler/transpile/create-build-program.ts#createTsBuildProgram() - init`);
  let isRunning = false;
  let timeoutId: any;

  const optionsToExtend = getTsOptionsToExtend(config);

  const tsWatchSys: ts.System = {
    ...ts.sys,

    watchFile(path, callback) {
      if (path.endsWith(`/${GENERATED_DTS}`)) {
        // potentially 2 watches being created?
        console.trace(`src/compiler/transpile/create-build-program.ts#createTsBuildProgram()#watchFile(path) - ${path}`);
        return ts.sys.watchFile(path, callback);
      }
      return {
        close() {},
      };
    },
    watchDirectory() {
      return {
        close() {},
      };
    },
    setTimeout(callback: (...args: any[]) => void , watchTimeoutMs: number) {
      timeoutId = setInterval(() => {
        if (!isRunning) {
          console.trace(`src/compiler/transpile/create-build-program.ts#setTimeout - isRunning: false`)
          callback();
          clearInterval(timeoutId);
        } else {
          console.trace(`src/compiler/transpile/create-build-program.ts#setTimeout - isRunning: true`)
        }
      }, config.sys.watchTimeout || watchTimeoutMs); // TODO: Probably a bug if config.sys.watchTimeout is 0
      return timeoutId;
    },

    clearTimeout(id) {
      console.trace(`src/compiler/transpile/create-build-program.ts#setTimeout - clearTimeout: ` + id)
      return clearInterval(id);
    },
  };

  config.sys.addDestory(() => tsWatchSys.clearTimeout(timeoutId));

  const tsWatchHost: ts.WatchCompilerHostOfConfigFile<ts.EmitAndSemanticDiagnosticsBuilderProgram> = ts.createWatchCompilerHost(
    config.tsconfig,
    optionsToExtend,
    tsWatchSys,
    ts.createEmitAndSemanticDiagnosticsBuilderProgram,
    (reportDiagnostic) => {
      config.logger.debug('watch reportDiagnostic:' + reportDiagnostic.messageText);
    },
    (reportWatchStatus) => {
      config.logger.debug('watch reportWatchStatus:' + reportWatchStatus.messageText);
    }
  );

  const id1 = Math.ceil(Math.random() * 1_000_000);
  tsWatchHost.afterProgramCreate = async (tsBuilder: ts.EmitAndSemanticDiagnosticsBuilderProgram) => {
    const id2 = Math.ceil(Math.random() * 1_000_000);
    console.trace('src/compiler/transpile/create-build-program.ts#afterProgramCreate - setting isRunning: true', id1, id2)
    isRunning = true;
    console.trace('src/compiler/transpile/create-build-program.ts#afterProgramCreate', id1, id2)
    await buildCallback(tsBuilder);
    console.trace('src/compiler/transpile/create-build-program.ts#afterProgramCreate - setting isRunning: false', id1, id2)
    isRunning = false;
    console.trace('src/compiler/transpile/create-build-program.ts#afterProgramCreate - COMPLETE', id1, id2)
  };
  console.trace('src/compiler/transpile/create-build-program.ts#createWatchProgram', id1)
  return ts.createWatchProgram(tsWatchHost);
};
