# fetch-figma-frame README

Internal tool for daybreak studio.

This extension converts your figma frame to react component when you paste it on the editor. Currently experimental.

Built with Adaline.

## Features

- Simply copy a link from your figma frame and paste it in your tsx file.
- Generate code base on your design system defined in global.css and tailwind config.

## Known Issues

- Support is limited to:
  - flexbox
  - border
  - corner radius
  - typography
  - color
  - shadow

Conversion is only limited frames, converting component is not supported at the moment

## Roadmap

- Planning to support the following in the future release

  - better parsing
  - converting svg for icons
  - support conversion component
  - support inline format changes

## Unreleased but implemented

- Support streaming generation
- Fix UX bug: re-triggering generation by undo

## Release Notes

### 1.1.0

Initial build
