# Change Log

All notable changes to the "logic-analyser" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.7] - 2026-10-22

- The extension now hosts the local desktop bridge itself (http://127.0.0.1:8091),
  so the website's Open VS Code and project-folder picker work without running
  the web repo's `npm run dev`.
- Opening a folder from the website asks for confirmation inside VS Code, and a
  session connect survives the window reload that follows a folder change.
- Bridge requests are limited to the BuildMyLogic websites and localhost, with a
  Host-header check against DNS rebinding.

## [Unreleased]

- Initial release
