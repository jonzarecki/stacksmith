# Stacksmith demo recording
# Run: vhs demo/record.tape
# Output: demo/demo.mp4

Output demo/demo.mp4
Output demo/demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 700
Set Padding 15
Set TypingSpeed 30ms
Set Theme "Catppuccin Mocha"

# Launch the replay demo
Type "pnpm demo --replay"
Enter

# Act 0: Opening banner + prereqs
Sleep 6s
Enter

# Act 1: The Problem — commentary
Sleep 5s
Enter

# Act 1 cont: git log + diff stat + warning box
Sleep 8s
Enter

# Act 2: stacksmith split — commentary
Sleep 5s
Enter

# Act 2 cont: simulated split with AI wait + plan table
# (the script simulates ~18s of AI generation + verification internally)
Sleep 30s
Enter

# Act 3: stacksmith apply — commentary
Sleep 5s
Enter

# Act 3 cont: apply output (tree, stats, equivalence)
Sleep 10s
Enter

# Act 3 cont: commit graph
Sleep 5s
Enter

# Act 4: push commentary
Sleep 5s
Enter

# Act 5: closing banner
Sleep 6s
