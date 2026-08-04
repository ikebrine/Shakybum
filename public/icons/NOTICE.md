# Third-Party Assets

## App icon — peach graphic

The peach graphic used in the app icon (`public/icons/`, Android launcher
icons, iOS app icon, splash screens) is sourced from Twemoji:

- Source: https://github.com/jdecked/twemoji
  (`assets/svg/1f351.svg` — U+1F351 PEACH)
- Copyright 2020 Twitter, Inc and other contributors
- Licensed under **CC-BY 4.0**: https://creativecommons.org/licenses/by/4.0/

CC-BY 4.0 requires attribution wherever the graphic (or material derived
from it) is shared. This file is that attribution. If you publish this
app to an app store, it's worth also including a short credit in the
app's About/Settings screen or store listing description — something
like:

> Emoji graphics by Twemoji, licensed under CC-BY 4.0
> (https://creativecommons.org/licenses/by/4.0/)

The original SVG source is kept at `public/icons/source/peach-twemoji.svg`
for reproducibility — every generated icon size/variant in this repo was
rasterized from that file, not from a bitmap emoji font, specifically so
edges stay smooth at every size instead of showing upscaling artifacts.

## Everything else

All other custom graphics (gradient backgrounds, card shapes, glow
effects, layout/composition) were generated for this project and aren't
subject to this notice.
