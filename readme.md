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
- Handle stop session
- Change variables when change scope
- Evaluate the correct call stack on continue event (subtle for the intermediate states we don't know file,line and variables)
- Support restart
- Callstack format