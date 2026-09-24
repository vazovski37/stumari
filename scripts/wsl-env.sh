# Source inside WSL (non-interactive shells do not get the Solana toolchain on PATH).
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$HOME/.local/bin:$PATH"
export NO_DNA=1
