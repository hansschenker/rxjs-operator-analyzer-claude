Add README.md with project description and Mistral AI contribution

co-author: mistral@mistral.ai
# RxJS Operator Analyzer

A **formal, automated, and visual** system for analyzing RxJS operator behavior using the **Mealy 6-Tuple method**.

This project provides tools to:
1. **Formally specify** RxJS operators as Mealy machines (6-Tuple).
2. **Generate** State Transition Tables, Execution Traces, and 4-Lane Timelines.
3. **Automatically create** exhaustive test cases for 100% behavioral coverage.
4. **Visualize** operator behavior over time.

---

## 🚀 Features
   Feature | Description |
 |---------|-------------|
 | **6-Tuple Formalism** | Define operators using the Mealy machine model (`Q, Σ, Δ, δ, λ, q₀`). |
 | **State Transition Table** | Exhaustive matrix of all `(state, input) → (next state, output)` pairs. |
 | **Execution Trace** | Step-by-step simulation for any input sequence. |
 | **4-Lane Timeline** | Visualize behavior over time (Timeline, Inputs, States, Outputs). |
 | **Test Case Generation** | Automatically generate Jest/Mocha tests for every transition. |
 | **YAML/JSON Definitions** | Declare operators in a human-readable format. |
 | **CLI Tool** | Generate all artifacts from the command line. |

---

## 📦 Installation

### Global CLI
```bash
npm install -g rxjs-operator-analyzer