"""
Mandi Agent - Project Structure PDF Generator
Generates a professional PDF document of the project structure.
"""

from fpdf import FPDF
from datetime import datetime


class ProjectPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 20)
        self.set_text_color(30, 80, 162)
        self.cell(0, 12, "Mandi Agent", new_x="LMARGIN", new_y="NEXT", align="C")
        self.set_font("Helvetica", "", 11)
        self.set_text_color(100, 100, 100)
        self.cell(0, 6, "AI-Powered Agricultural Market Intelligence Platform", new_x="LMARGIN", new_y="NEXT", align="C")
        self.ln(2)
        self.set_draw_color(30, 80, 162)
        self.set_line_width(0.8)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title, icon=""):
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(30, 80, 162)
        self.cell(0, 10, f"{icon}  {title}", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def sub_section(self, title):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(60, 60, 60)
        self.cell(0, 8, f"    {title}", new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def tree_line(self, text, indent=0, bold=False):
        self.set_font("Courier", "B" if bold else "", 9)
        self.set_text_color(50, 50, 50)
        x = 15 + (indent * 4)
        self.set_x(x)
        self.cell(0, 5, text, new_x="LMARGIN", new_y="NEXT")

    def info_row(self, label, value):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(60, 60, 60)
        self.cell(45, 7, label, new_x="RIGHT")
        self.set_font("Helvetica", "", 10)
        self.set_text_color(80, 80, 80)
        self.cell(0, 7, value, new_x="LMARGIN", new_y="NEXT")

    def table_header(self, headers, widths):
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(30, 80, 162)
        self.set_text_color(255, 255, 255)
        for i, (h, w) in enumerate(zip(headers, widths)):
            self.cell(w, 8, h, border=1, fill=True, align="C", new_x="RIGHT")
        self.ln()

    def table_row(self, cells, widths, fill=False):
        self.set_font("Helvetica", "", 9)
        self.set_text_color(50, 50, 50)
        if fill:
            self.set_fill_color(240, 245, 255)
        for i, (c, w) in enumerate(zip(cells, widths)):
            align = "L" if i > 0 else "L"
            self.cell(w, 7, c, border=1, fill=fill, align=align, new_x="RIGHT")
        self.ln()


def generate_pdf():
    pdf = ProjectPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ── Page 1: Cover + Overview ──
    pdf.add_page()

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", new_x="LMARGIN", new_y="NEXT", align="R")
    pdf.ln(4)

    # Project Overview
    pdf.section_title("Project Overview")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    overview = (
        "Mandi Agent is an AI-powered agricultural market intelligence platform designed to help "
        "Indian farmers and FPOs (Farmer Producer Organizations) make better decisions about crop "
        "pricing, market selection, and risk management. The system uses multiple AI agents orchestrated "
        "via LangGraph, with data from government APIs (AgMarkNet, eNAM, IMD), satellite imagery "
        "(ISRO MOSDAC, NASA POWER), and a RAG pipeline backed by Supabase vector search. "
        "It supports multilingual voice interactions via Reverie and automated alerts through n8n workflows."
    )
    pdf.multi_cell(0, 6, overview)
    pdf.ln(6)

    # Tech Stack
    pdf.section_title("Technology Stack")
    stack = [
        ("Framework", "FastAPI (Python)"),
        ("AI / LLM", "Google Gemini via LangChain"),
        ("Orchestration", "LangGraph (multi-agent flow)"),
        ("Database", "Supabase (PostgreSQL + pgvector)"),
        ("RAG Pipeline", "Supabase Vector Store + Embeddings"),
        ("Voice / STT / TTS", "Reverie (current), Bhashini (legacy)"),
        ("Automations", "n8n (webhook-based workflows)"),
        ("Data Sources", "AgMarkNet, eNAM, IMD, ISRO MOSDAC, NASA POWER"),
    ]
    for label, value in stack:
        pdf.info_row(f"  {label}:", value)
    pdf.ln(8)

    # ── Page 2: Directory Tree ──
    pdf.add_page()
    pdf.section_title("Directory Structure")

    tree_lines = [
        (0, "mandi_agent/", True),
        (0, "|", False),
        (0, "|-- .env                              # Environment variables", False),
        (0, "|-- .env.example                      # Env template", False),
        (0, "|-- __init__.py", False),
        (0, "|-- requirements.txt                  # Python dependencies", False),
        (0, "|-- README.md", False),
        (0, "|-- supabase_match_function.sql       # Vector match SQL", False),
        (0, "|", False),
        (0, "|-- backend/                          # Core application", True),
        (0, "|   |-- __init__.py", False),
        (0, "|   |-- main.py                       # FastAPI entry point (23 KB)", False),
        (0, "|   |", False),
        (0, "|   |-- agents/                       # AI Agents", True),
        (0, "|   |   |-- data_ingestion.py         # Data ingestion agent", False),
        (0, "|   |   |-- guardrails.py             # Agent guardrails", False),
        (0, "|   |   |-- negotiation.py            # Price negotiation", False),
        (0, "|   |   |-- news_agent.py             # Agri-news agent", False),
        (0, "|   |   |-- oversupply_detector.py    # Oversupply detection", False),
        (0, "|   |   |-- price_prediction.py       # Price forecasting", False),
        (0, "|   |   |-- rag_advisory.py           # RAG-based advisory", False),
        (0, "|   |   |-- spoilage_risk.py          # Spoilage risk assessment", False),
        (0, "|   |   +-- voice_interface.py        # Voice interaction", False),
        (0, "|   |", False),
        (0, "|   |-- automations/                  # n8n triggers", True),
        (0, "|   |   +-- n8n_triggers.py           # Webhook trigger logic", False),
        (0, "|   |", False),
        (0, "|   |-- data_sources/                 # External data connectors", True),
        (0, "|   |   |-- agmarknet.py              # AgMarkNet mandi prices", False),
        (0, "|   |   |-- agri_news.py              # Agricultural news", False),
        (0, "|   |   |-- enam.py                   # eNAM trading platform", False),
        (0, "|   |   |-- fusion.py                 # Data fusion layer", False),
        (0, "|   |   |-- imd_weather.py            # IMD weather data", False),
        (0, "|   |   |-- isro_mosdac.py            # ISRO MOSDAC satellite", False),
        (0, "|   |   +-- nasa_power.py             # NASA POWER climate", False),
        (0, "|   |", False),
        (0, "|   |-- guardrails/                   # Safety & validation", True),
        (0, "|   |   +-- safety.py                 # I/O safety checks", False),
        (0, "|   |", False),
        (0, "|   |-- models/                       # Data models", True),
        (0, "|   |   +-- schemas.py                # Pydantic schemas", False),
        (0, "|   |", False),
        (0, "|   |-- orchestrator/                 # Agent orchestration", True),
        (0, "|   |   +-- langgraph_flow.py         # LangGraph workflow", False),
        (0, "|   |", False),
        (0, "|   |-- rag/                          # RAG pipeline", True),
        (0, "|   |   |-- embeddings.py             # Embedding generation", False),
        (0, "|   |   |-- ingestion.py              # Document ingestion", False),
        (0, "|   |   +-- retrieval.py              # Vector search", False),
        (0, "|   |", False),
        (0, "|   +-- voice/                        # Voice / STT / TTS", True),
        (0, "|       |-- bhashini.py               # Bhashini (legacy)", False),
        (0, "|       +-- reverie_voice.py          # Reverie (current)", False),
        (0, "|", False),
        (0, "|-- n8n/                              # n8n workflows", True),
        (0, "|   |-- agri_news_alerts.json", False),
        (0, "|   +-- workflows/", True),
        (0, "|       |-- bundle_notification.json", False),
        (0, "|       |-- fpo_weekly_digest.json", False),
        (0, "|       |-- harvest_alerts_daily.json", False),
        (0, "|       |-- price_crash_broadcast.json", False),
        (0, "|       |-- scheme_eligibility.json", False),
        (0, "|       |-- spoilage_emergency.json", False),
        (0, "|       +-- whatsapp_advisory_loop.json", False),
        (0, "|", False),
        (0, "+-- [utility scripts & logs]          # ~25 helper scripts", False),
    ]

    for indent, text, bold in tree_lines:
        pdf.tree_line(text, indent, bold)

    # ── Page 3: Architecture Table ──
    pdf.add_page()
    pdf.section_title("Architecture Layers")

    widths = [40, 50, 100]
    pdf.table_header(["Layer", "Directory", "Purpose"], widths)

    rows = [
        ("Entry Point", "backend/main.py", "FastAPI server with all API endpoints"),
        ("AI Agents", "backend/agents/", "9 specialized agents (price, news, negotiation...)"),
        ("Data Sources", "backend/data_sources/", "7 connectors (AgMarkNet, eNAM, IMD, NASA...)"),
        ("RAG Pipeline", "backend/rag/", "Embeddings, ingestion, vector retrieval"),
        ("Voice", "backend/voice/", "Bhashini (legacy) + Reverie (current) STT/TTS"),
        ("Orchestrator", "backend/orchestrator/", "LangGraph multi-agent workflow"),
        ("Guardrails", "backend/guardrails/", "Safety checks on agent I/O"),
        ("Automations", "backend/automations/", "n8n webhook trigger integration"),
        ("n8n Workflows", "n8n/workflows/", "7 automation workflow JSON definitions"),
        ("Schemas", "backend/models/", "Pydantic data models"),
    ]
    for i, row in enumerate(rows):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.ln(10)

    # AI Agents Detail
    pdf.section_title("AI Agents Detail")

    widths2 = [50, 55, 85]
    pdf.table_header(["Agent", "File", "Description"], widths2)

    agents = [
        ("Price Prediction", "price_prediction.py", "ML-based price forecasting for crops"),
        ("Negotiation", "negotiation.py", "Optimal price negotiation strategies"),
        ("News Agent", "news_agent.py", "Agricultural news aggregation & alerts"),
        ("Oversupply", "oversupply_detector.py", "Market oversupply pattern detection"),
        ("Spoilage Risk", "spoilage_risk.py", "Perishable crop spoilage risk scoring"),
        ("RAG Advisory", "rag_advisory.py", "Knowledge-based farming advisory"),
        ("Data Ingestion", "data_ingestion.py", "Auto-ingest data from sources"),
        ("Voice Interface", "voice_interface.py", "Multilingual voice interactions"),
        ("Guardrails", "guardrails.py", "Agent output safety validation"),
    ]
    for i, row in enumerate(agents):
        pdf.table_row(row, widths2, fill=(i % 2 == 0))

    pdf.ln(10)

    # Data Sources Detail
    pdf.section_title("Data Sources Detail")

    widths3 = [45, 50, 95]
    pdf.table_header(["Source", "File", "Description"], widths3)

    sources = [
        ("AgMarkNet", "agmarknet.py", "Government mandi price data (daily)"),
        ("eNAM", "enam.py", "National Agriculture Market platform"),
        ("IMD Weather", "imd_weather.py", "India Meteorological Dept. forecasts"),
        ("ISRO MOSDAC", "isro_mosdac.py", "Satellite-based crop/soil monitoring"),
        ("NASA POWER", "nasa_power.py", "Climate & solar radiation data"),
        ("Agri News", "agri_news.py", "Agricultural news feeds"),
        ("Fusion", "fusion.py", "Multi-source data fusion layer"),
    ]
    for i, row in enumerate(sources):
        pdf.table_row(row, widths3, fill=(i % 2 == 0))

    pdf.ln(10)

    # n8n Workflows
    pdf.section_title("n8n Automation Workflows")

    widths4 = [60, 130]
    pdf.table_header(["Workflow", "Description"], widths4)

    workflows = [
        ("bundle_notification", "Bundled notifications to farmers"),
        ("fpo_weekly_digest", "Weekly digest for FPO managers"),
        ("harvest_alerts_daily", "Daily harvest timing alerts"),
        ("price_crash_broadcast", "Emergency price crash broadcasts"),
        ("scheme_eligibility", "Government scheme eligibility checks"),
        ("spoilage_emergency", "Spoilage emergency notifications"),
        ("whatsapp_advisory_loop", "WhatsApp-based advisory loop"),
    ]
    for i, row in enumerate(workflows):
        pdf.table_row(row, widths4, fill=(i % 2 == 0))

    # Save
    output_path = "Mandi_Agent_Project_Structure.pdf"
    pdf.output(output_path)
    print(f"\nPDF generated successfully: {output_path}")
    print(f"Location: d:\\ktr\\mandi_agent\\{output_path}")


if __name__ == "__main__":
    generate_pdf()
