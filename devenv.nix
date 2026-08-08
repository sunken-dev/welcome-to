{ pkgs, ... }:

{
  # Node 24 "Krypton", the active LTS line.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    npm.enable = true;
  };

  enterTest = ''
    npm test
  '';
}
