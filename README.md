# CoDesign — EBCT MVP
*A demo AI mediator for supporting design–engineering collaboration in water treatment systems (starting with EBCT calculation).*

---

## 🔗 Live Demo
Vercel deployment: [codesign-ten.vercel.app](https://codesign-ten.vercel.app)

---

## 🚀 Setup & Run

### 1. Setup with a single command
On Mac/Linux you can simply run:

```bash
sh setup.sh
```

This will create a virtual environment, activate it, and install all required dependencies.

---

### 2. Configure environment (optional)
Copy `.env.example` to `.env` and set environment variables such as `PORT` if needed.

---

### 3. Run the server
Start the Flask backend:

```bash
python app.py
```

By default, the server runs at [http://127.0.0.1:5000](http://127.0.0.1:5000).

---

### 4. Open in browser
Navigate to the server’s address in your browser to use the app.

---

## 💡 Usage Examples
Enter natural language queries:

- `EBCT? flow 800 gpm, bed volume 9600 gal`  
- `Tank diameter 10 ft, bed height 8 ft, flow 900 gpm`

---

## 📐 Calculation
- **EBCT(min)** = Volume(gal) / Flow(gal/min)  
- **Cylinder volume(ft³)** = π × (D/2)² × H  
- **Unit conversions**  
  - 1 ft³ = 7.48052 gal  
  - Supported units: gpm, L/min, m³/h / gal, ft³, m³ / ft, m, in  

---

## 🧭 Context
This MVP is part of the PITA project *“Automating PFAS Treatment and GAC System Design Refinement for Efficient Water Systems Operations and Maintenance”*.  
It demonstrates how AI mediators can structure communication and support EBCT calculations in design–engineering collaboration workflows.
