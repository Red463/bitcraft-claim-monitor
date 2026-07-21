# BitCraft Settlement Operations

Domain language used by the claim monitor when describing BitCraft resources, routes, and planning quantities.

## Gathering and Prospecting

**Ordinary gathering node**:
A resource node whose finite health represents the progress available before depletion.
_Avoid_: Prospecting node

**Prospecting**:
A family of rare-material gathering activities in which a player repeatedly activates the relevant material-specific prospecting skill, follows a direction and distance through a variable sequence of steps, and ultimately discovers a generated resource node. Argent is one example, not the definition of the activity.
_Avoid_: Ordinary gathering, resource tracking

**Prospecting step**:
One intermediate direction-and-distance instruction in a prospecting sequence. Completing all required steps reveals the final direction and distance to the generated node.
_Avoid_: Hit, gathering action

**Prospecting node**:
A generated rare-material resource whose displayed health does not deplete and must not be treated as its available gathering progress. Gathering ends when the game reports that the player has gathered all they can.
_Avoid_: Finite-health node

**Prospecting exhaustion**:
The terminal state that prevents further gathering from a prospecting node. Its controlling limit is currently unknown and is distinct from ordinary health depletion.
_Avoid_: Node depletion
