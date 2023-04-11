import color from 'ansi-colors';
import inquirer from 'inquirer';

import { BuildOptions } from './utils/options';
import {
  getNewVersion,
  isPrereleaseVersion,
  isValidVersionInput,
  prettyVersionDiff,
  SEMVER_INCREMENTS,
} from './utils/release-utils';

/**
 * A type describing the answers to prompts for preparing a release
 */
export type PrepareReleasePromptAnswers = {
  /**
   * If `true`, run release preparation steps
   */
  confirm: boolean;
  /**
   * A semver compliant version, generated by the prompting question
   */
  version?: string;
  /**
   * A user defined version. This version takes precedence over {@link PrepareReleasePromptAnswers#version}.
   */
  specifiedVersion?: string;
};

/**
 * A type describing the normalized responses of {@link PrepareReleasePromptAnswers}
 */
export type NormalizedPrepareResponses = {
  /**
   * If `true`, run release preparation steps
   */
  confirm: boolean;
  /**
   * The semver string to publish use Stencil under
   */
  versionToUse: string;
};

/**
 * Prompts a developer to answer questions regarding how a release of Stencil should be performed
 * @param opts build options containing the metadata needed to release a new version of Stencil
 */
export async function promptPrepareRelease(opts: BuildOptions): Promise<NormalizedPrepareResponses> {
  const pkg = opts.packageJson;
  const oldVersion = opts.packageJson.version;

  const NON_SERVER_INCREMENTS: ReadonlyArray<{ name: string; value: string }> = [
    {
      name: 'Dry Run',
      value: getNewVersion(oldVersion, 'patch') + '-dryrun',
    },
    {
      name: 'Other (specify)',
      value: null,
    },
  ];

  const prompts: inquirer.QuestionCollection<PrepareReleasePromptAnswers> = [
    {
      type: 'list',
      name: 'version',
      message: 'Select semver increment or specify new version',
      pageSize: SEMVER_INCREMENTS.length + NON_SERVER_INCREMENTS.length,
      choices: SEMVER_INCREMENTS.map((inc) => ({
        name: `${inc}   ${prettyVersionDiff(oldVersion, inc)}`,
        value: inc,
      })).concat([new inquirer.Separator() as any, ...NON_SERVER_INCREMENTS]),
      filter: (input: string) => (isValidVersionInput(input) ? getNewVersion(oldVersion, input) : input),
    },
    {
      type: 'input',
      // this name is intentionally different from 'version' above to make the `when` check below work properly
      // (this prompt should only run if `version` was not already input)
      name: 'specifiedVersion',
      message: 'Specify Version',
      when: (answers: any) => !answers.version,
      filter: (input: string) => (isValidVersionInput(input) ? getNewVersion(pkg.version, input) : input),
      validate: (input: string) => {
        if (!isValidVersionInput(input)) {
          return 'Please specify a valid semver, for example, `1.2.3`, or `3.0.0-alpha.0`. See http://semver.org';
        }
        return true;
      },
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: (answers: any) => {
        const version = determineAnsweredVersionToUse(answers);
        return `Prepare release ${opts.vermoji}  ${color.yellow(version)} from ${oldVersion}. Continue?`;
      },
    },
  ];

  try {
    const answers = await inquirer.prompt<PrepareReleasePromptAnswers>(prompts);
    return {
      confirm: answers.confirm,
      versionToUse: determineAnsweredVersionToUse(answers),
    };
  } catch (err: any) {
    console.log('\n', color.red(err), '\n');
    process.exit(0);
  }
}

/**
 * Helper function to determine which version string to use.
 *
 * Due to a bug in Inquirer, the version to publish Stencil under needs to be specified under two different fields when
 * the release preparation scripts diverge in questioning. This function ensures the logic for determining which of
 * those two answers is to be used.
 *
 * @param answers user provided answers to pick from
 * @returns the version string to use. defaults to 'UNKNOWN' if the version cannot be determined.
 */
export function determineAnsweredVersionToUse(answers: PrepareReleasePromptAnswers): string {
  return answers.version ? answers.version : answers.specifiedVersion ? answers.specifiedVersion : 'UNKNOWN';
}

/**
 * A type describing the answers to prompts for performing a release
 */
export type ReleasePromptAnswers = {
  /**
   * If `true`, run release steps
   */
  confirm: boolean;
  /**
   * A one-time password, provided by a developer's authenticator application
   */
  otp: string;
  /**
   * A user specified tag to push to the npm registry. If provided, this overrider {@link ReleasePromptAnswers#tag}
   */
  specifiedTag?: string;
  /**
   * The tag to push to the npm registry. This is _not_ the tag pushed to GitHub
   */
  tag?: string;
};

/**
 * A type describing the normalized responses of {@link ReleasePromptAnswers}
 */
export type NormalizedReleaseResponses = {
  /**
   * If `true`, run release preparation steps
   */
  confirm: boolean;
  /**
   * A one-time password, provided by a developer's authenticator application
   */
  otp: string;
  /**
   * The tag to push to the npm registry. This is _not_ the tag pushed to GitHub
   */
  npmTag: string;
};

/**
 * Prompts a developer to answer questions regarding how a release of Stencil should be performed
 * @param opts build options containing the metadata needed to publish a new version of Stencil
 */
export async function promptRelease(opts: BuildOptions): Promise<NormalizedReleaseResponses> {
  const pkg = opts.packageJson;

  const { execa } = await import('execa');

  const prompts: inquirer.QuestionCollection<ReleasePromptAnswers> = [
    {
      type: 'list',
      name: 'tag',
      message: 'How should this pre-release version be tagged in npm?',
      when: () => isPrereleaseVersion(opts.version),
      choices: () =>
        execa('npm', ['view', '--json', pkg.name, 'dist-tags']).then(({ stdout }) => {
          const existingPrereleaseTags = Object.keys(JSON.parse(stdout))
            .filter((tag) => tag !== 'latest')
            .map((tag) => {
              return {
                name: tag,
                value: tag,
              };
            });

          if (existingPrereleaseTags.length === 0) {
            existingPrereleaseTags.push({
              name: 'next',
              value: 'next',
            });
          }

          return existingPrereleaseTags.concat([
            new inquirer.Separator() as any,
            {
              name: 'Other (specify)',
              value: null,
            },
          ]);
        }),
    },
    {
      type: 'input',
      // this name is intentionally different from 'tag' above. if they collide, this input prompt will not run.
      name: 'specifiedTag',
      message: 'Specify Tag',
      when: (answers: any) => !pkg.private && isPrereleaseVersion(opts.version) && !answers.tag,
      validate: (input: any) => {
        if (input.length === 0) {
          return 'Please specify a tag, for example, `next` or `3.0.0-alpha.0`.';
        } else if (input.toLowerCase() === 'latest') {
          return "It's not possible to publish pre-releases under the `latest` tag. Please specify something else, for example, `next` or `3.0.0-alpha.0`.";
        }
        return true;
      },
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: (answers: any) => {
        const tagToUse = determineAnsweredTagToUse(answers);
        const tagPart = ` and tag this release in npm as ${color.yellow(tagToUse)}`;
        return `Will publish ${opts.vermoji}  ${color.yellow(opts.version)}${tagPart}. Continue?`;
      },
    },
    {
      type: 'input',
      name: 'otp',
      message: 'Enter OTP:',
      validate: (input: any) => {
        if (input.length !== 6) {
          return 'Please enter a valid one-time password.';
        }
        return true;
      },
    },
  ];

  try {
    const answers = await inquirer.prompt<ReleasePromptAnswers>(prompts);
    return {
      confirm: answers.confirm,
      otp: answers.otp,
      npmTag: determineAnsweredTagToUse(answers),
    };
  } catch (err: any) {
    console.log('\n', color.red(err), '\n');
    process.exit(0);
  }
}

/**
 * Helper function to determine which tag string to use.
 *
 * Due to a bug in Inquirer, the tag to publish Stencil under needs to be specified under two different fields when
 * the release scripts diverge in questioning. This function ensures the logic for determining which of those two
 * answers is to be used.
 *
 * @param answers user provided answers to pick from
 * @returns the tag to use. defaults to 'UNKNOWN' if the tag cannot be determined.
 */
export function determineAnsweredTagToUse(answers: ReleasePromptAnswers): string {
  return answers.tag ? answers.tag : answers.specifiedTag ? answers.specifiedTag : 'UNKNOWN';
}