# Setting Up Local Repository

1. Clone the Angular-CLI repo. A local copy works just fine.
1. Create an upstream remote:

```bash
$ git remote add upstream https://github.com/angular/angular-cli.git
```

# Caretaker

The caretaker should triage issues, merge PR, and sheppard the release.

Caretaker calendar can be found [here](https://calendar.google.com/calendar/embed?src=angular.io_jf53juok1lhpm84hv6bo6fmgbc%40group.calendar.google.com&ctz=America%2FLos_Angeles).

Each shift consists of two caretakers. The primary caretaker is responsible for
merging PRs to master and patch whereas the secondary caretaker is responsible
for the release. Primary-secondary pairs are as follows:

| Primary | Secondary |
| ------- | --------- |
| Alan    | Doug      |
| Charles | Keen      |
| Filipe  | Joey      |

## Merging PRs

The list of PRs which are currently ready to merge (approved with passing status checks) can
be found with [this search](https://github.com/angular/angular-cli/pulls?q=is%3Apr+is%3Aopen+label%3A%22action%3A+merge%22+-is%3Adraft).
This list should be checked daily and any ready PRs should be merged. For each PR, check the
`target` label to understand where it should be merged to. You can find which branches a specific
PR will be merged into with the `yarn ng-dev pr check-target-branches <pr>` command.

When ready to merge a PR, run the following command:

```
yarn ng-dev pr merge <pr>
```

### Maintaining LTS branches

Releases that are under Long Term Support (LTS) are listed on [angular.io](https://angular.io/guide/releases#support-policy-and-schedule).

Since there could be more than one LTS branch at any one time, PR authors who want to
merge commits into LTS branches must open a pull request against the specific base branch they'd like to target.

In general, cherry picks for LTS should only be done if it meets one of the criteria below:

1. It addresses a critical security vulnerability.
2. It fixes a breaking change in the external environment.
   For example, this could happen if one of the dependencies is deleted from NPM.
3. It fixes a legitimate failure on CI for a particular LTS branch.

# Release

Releasing is performed using Angular's unified release tooling. Each week, two releases are expected, `latest` and `next` on npm.

**For a minor OR major release:**

After FW releases `-rc.0` for an upcoming minor/major version, update the corresponding version in
[`latest-versions.ts`](/packages/schematics/angular/utility/latest-versions.ts#L=18) **and** peer
dependencies on FW ([here](/packages/angular_devkit/build_angular/package.json) and
[here](/packages/ngtools/webpack/package.json)) to match. This ensures that CLI `-rc.0` depends on
FW `-rc.0`.

The same needs to be done for a `-next.0` release, and needs to be done for both minor _and_ major
releases.

Once FW releases the actual minor/major release (for example: `13.0.0` or `13.1.0`), these versions
should be updated to match (remove `-rc.0` and `-next.0`). This can be done as part of the release
PR ([example](https://github.com/angular/angular-cli/pull/22580/files#diff-53a0da39e6b029472ba808fdd567f8706e752434fa51be6009f0140532b9fe2f))
or a separate PR after FW releases but before CLI releases.

**For a major release:**

When a release is transitioning from a prerelease to a stable release, the semver ranges for Angular dependencies within the packages' `package.json` files will need to be updated to remove the prerelease version segment.
For example, `"@angular/compiler-cli": "^13.0.0 || ^13.0.0-next"` in a prerelease should become `"@angular/compiler-cli": "^13.0.0"` in the stable release.
The current packages that require adjustment are:

- `@angular-devkit/build-angular`: [packages/angular_devkit/build_angular/package.json](/packages/angular_devkit/build_angular/package.json)
- `@ngtools/webpack`: [packages/ngtools/webpack/package.json](/packages/ngtools/webpack/package.json)

## Releasing the CLI

Typical patch and next releases do not require FW to release in advance, as CLI does not pin the FW
dependency.

After confirming that the above steps have been done or are not necessary, run the following and
navigate the prompts:

```sh
yarn ng-dev release publish
```

## Changing shifts

If you need to update the
[caretaker calendar](https://calendar.google.com/calendar/embed?src=angular.io_jf53juok1lhpm84hv6bo6fmgbc%40group.calendar.google.com&ctz=America%2FLos_Angeles)
to modify shifts, **make sure you are logged in as your @angular.io account** and
click the "+ Google Calendar" button in the bottom right to add it to your Google
Calendar account. You should then be able to find and modify events on
calendar.google.com. The calendar is a part of the `angular.io` organization, so
events can only be modified by users in the same organization.
