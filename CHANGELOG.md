# Changelog

## [0.5.0](https://github.com/technicalpickles/sb/compare/v0.4.2...v0.5.0) (2026-08-31)


### Features

* add sb hooks devlog-nudge command for external nudge hooks ([#28](https://github.com/technicalpickles/sb/issues/28)) ([08193a3](https://github.com/technicalpickles/sb/commit/08193a3a7a14b93820b4f1dc99850769904edbf5))

## [0.4.2](https://github.com/technicalpickles/sb/compare/v0.4.1...v0.4.2) (2026-08-28)


### Bug Fixes

* **daily:** create the daily note when missing instead of throwing ENOENT ([#27](https://github.com/technicalpickles/sb/issues/27)) ([830689f](https://github.com/technicalpickles/sb/commit/830689fdd933d4fdea89a827a98c3260339a3903))
* **daily:** match section headings without requiring the literal ## prefix ([#25](https://github.com/technicalpickles/sb/issues/25)) ([b5579e5](https://github.com/technicalpickles/sb/commit/b5579e5adaf925fd82c9e39748bf85f53e9c8f96))

## [0.4.1](https://github.com/technicalpickles/sb/compare/v0.4.0...v0.4.1) (2026-08-17)


### Bug Fixes

* require CI and PR title checks on main ([#23](https://github.com/technicalpickles/sb/issues/23)) ([06f6b0a](https://github.com/technicalpickles/sb/commit/06f6b0a24383c44517c26bdc938a2119477550b2))

## [0.4.0](https://github.com/technicalpickles/sb/compare/v0.3.1...v0.4.0) (2026-07-01)


### Features

* add note list subcommand with --type filter ([9c1b3ee](https://github.com/technicalpickles/sb/commit/9c1b3ee14656299313eca8f7ce2861565a6862bc))
* add note list subcommand with --type filter ([6a1df96](https://github.com/technicalpickles/sb/commit/6a1df9648e260f878fff37e7890d60538759cb5b))
* add sb mcp read-only Streamable HTTP server (MCP Phase 1) ([1b143d7](https://github.com/technicalpickles/sb/commit/1b143d7fc92afa655b473212d3f28e0b744d27bd))


### Bug Fixes

* resolve errors module path and handle bind failures in mcp server ([5515578](https://github.com/technicalpickles/sb/commit/551557860ae140ef909daca3b4a644cf752d255e))

## [0.3.1](https://github.com/technicalpickles/sb/compare/v0.3.0...v0.3.1) (2026-06-15)


### Bug Fixes

* read --version from package.json ([a062c3c](https://github.com/technicalpickles/sb/commit/a062c3cf496103e163907544e0e37b8371e71074))
* read --version from package.json ([aadb9be](https://github.com/technicalpickles/sb/commit/aadb9beecad2708c3b8bdba9303b1ebf838133e1))

## [0.3.0](https://github.com/technicalpickles/sb/compare/v0.2.0...v0.3.0) (2026-06-15)


### Features

* detect Johnny Decimal folders in vault structure ([#1](https://github.com/technicalpickles/sb/issues/1)) ([34f9537](https://github.com/technicalpickles/sb/commit/34f95370a6a5ff102a24cbd958200e7b4e32d532))


### Bug Fixes

* **cli:** friendly error when config missing instead of stacktrace ([b08bb08](https://github.com/technicalpickles/sb/commit/b08bb08bcd94ad69d6de2d3f5115479109620e84))
* **cli:** friendly error when config missing instead of stacktrace ([1f498e9](https://github.com/technicalpickles/sb/commit/1f498e9f13c6f8cab61b2872f9c7c8bd7634fe5f))
* **note:** error when --content is passed but empty ([80634d7](https://github.com/technicalpickles/sb/commit/80634d73bab28f323c538b29c4fcd909da4da029))
* **note:** error when --content is passed but empty ([fd2d679](https://github.com/technicalpickles/sb/commit/fd2d6797dd95575846f6a8db41e2c2dd68ac9e9f))
