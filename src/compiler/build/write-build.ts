import type * as d from '../../declarations';
import { catchError } from '@utils';
import { outputServiceWorkers } from '../output-targets/output-service-workers';
import { validateBuildFiles } from './validate-files';

export const writeBuild = async (config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx) => {
  const timeSpan = buildCtx.createTimeSpan(`writeBuildFiles started`, true);

  let totalFilesWrote = 0;

  try {
    // commit all the writeFiles, mkdirs, rmdirs and unlinks to disk
    const commitResults = await compilerCtx.fs.commit();

    // get the results from the write to disk commit
    buildCtx.filesWritten = commitResults.filesWritten;
    buildCtx.filesDeleted = commitResults.filesDeleted;
    buildCtx.dirsDeleted = commitResults.dirsDeleted;
    buildCtx.dirsAdded = commitResults.dirsAdded;
    totalFilesWrote = commitResults.filesWritten.length;

    // successful write
    // kick off writing the cached file stuff
    // await compilerCtx.cache.commit();
    buildCtx.debug(`in-memory-fs: ${compilerCtx.fs.getMemoryStats()}`);
    console.trace(`src/compiler/build/write-build.ts#writeBuild() - memory stats: ${compilerCtx.fs.getMemoryStats()}`)
    console.log(`src/compiler/build/write-build.ts#writeBuild() - commitResults.filesWritten: ${commitResults.filesWritten.sort().join('\n')}`)
    console.log(`src/compiler/build/write-build.ts#filesDeleted() - commitResults.filesDeleted: ${commitResults.filesDeleted.sort().join('\n')}`)
    console.log(`src/compiler/build/write-build.ts#dirsDeleted() - commitResults.dirsDeleted: ${commitResults.dirsDeleted.sort().join('\n')}`)
    console.log(`src/compiler/build/write-build.ts#dirsAdded() - commitResults.dirsAdded: ${commitResults.dirsAdded.sort().join('\n')}`)
    // buildCtx.debug(`cache: ${compilerCtx.cache.getMemoryStats()}`);

    await outputServiceWorkers(config, buildCtx), await validateBuildFiles(config, compilerCtx, buildCtx);
  } catch (e: any) {
    catchError(buildCtx.diagnostics, e);
  }

  timeSpan.finish(`writeBuildFiles finished, files wrote: ${totalFilesWrote}`);
};
