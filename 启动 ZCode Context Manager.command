#!/bin/zsh
set -eu
cd -- "${0:A:h}"
if [[ -x "$PWD/.local/bin/node" ]]; then
  zcode_node="$PWD/.local/bin/node"
else
  zcode_node="$(command -v node)"
fi
if [[ ! -x "$PWD/build/ZCode Context Control.app/Contents/MacOS/ContextControl" ]]; then
  "$zcode_node" scripts/build-mac.mjs
fi
"$zcode_node" scripts/install-current.mjs
printf '\n请先完全退出 ZCode；回车后以适配环境启动。\n'
read -r
"$zcode_node" src/zcode/launch.mjs
