# Solitude Debug

Debug a committed transaction using solitude by passing the Transaction Id.

# Installation

- npm install --save
- npm run postinstall
- npm compile

![Solitude Debug](images/debug.png)

# TO-DO

- Register breakpoints when the session starts
- Line Breakpoints
- Clear Breakpoints
- Exception handling
- Hierarchical call stack view (X)
- Handle end session messages
- Adapt Solitude session to Truffle project
- Red highlight when exception found on continue (active editor may on the same file)
- Add command for the REPL interface
- Clean decorations onStop event
- Change variables when change scope
- Handle stop session