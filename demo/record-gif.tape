# Fast demo recording for README GIF
# Run: vhs demo/record-gif.tape
# Output: demo/demo.gif (~25s, optimized for GitHub README)

Output demo/demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 700
Set Padding 15
Set TypingSpeed 20ms
Set Theme "Catppuccin Mocha"

# Launch quick replay
Type "pnpm demo --quick"
Enter

# Act 0: Opening banner
Sleep 4s
Enter

# Act 1: The Problem — commentary
Sleep 2s
Enter

# Act 1 cont: diff stat + warning
Sleep 4s
Enter

# Act 2: split — commentary
Sleep 2s
Enter

# Act 2 cont: AI simulation + plan table
Sleep 6s
Enter

# Act 3: apply — commentary
Sleep 2s
Enter

# Act 3 cont: apply output (tree, stats, equivalence)
Sleep 7s
Enter

# Closing banner
Sleep 4s
