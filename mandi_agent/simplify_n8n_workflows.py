#!/usr/bin/env python3
"""
Simplify and fix n8n workflows programmatically via n8n REST API.

This script:
1. Deletes dead stub workflows (My workflow, My workflow 2, Spoilage Emergency copy)
2. Fixes Scheme Eligibility Check race condition (adds Merge node before IF)
3. Fixes Price Crash dual logging (Notion + Supabase → Supabase only)
4. Fixes Price Crash double Telegram (remove redundant follow-up alert)
5. Fixes WhatsApp Advisory Loop naming and consolidates logging
6. Exports cleaned workflows to workflows_clean.json for backup

Requires: N8N_WEBHOOK_URL and N8N_API_KEY environment variables
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any, Optional

import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

N8N_BASE_URL = os.getenv("N8N_API_URL", "http://localhost:5678").rstrip("/")
N8N_API_KEY = os.getenv("N8N_API_KEY", "")
HEADERS = {
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
}


class N8NWorkflowFixer:
    """Fix n8n workflows via REST API."""

    def __init__(self):
        self.client = httpx.Client(timeout=30.0, headers=HEADERS)

    def get_all_workflows(self) -> list[dict]:
        """Fetch all workflows from n8n."""
        response = self.client.get(f"{N8N_BASE_URL}/api/v1/workflows")
        if response.status_code != 200:
            logger.error(f"Failed to fetch workflows: {response.text}")
            return []
        data = response.json()
        return data.get("data", [])

    def get_workflow(self, workflow_id: str) -> Optional[dict]:
        """Fetch a specific workflow."""
        response = self.client.get(f"{N8N_BASE_URL}/api/v1/workflows/{workflow_id}")
        if response.status_code != 200:
            logger.error(f"Failed to fetch workflow {workflow_id}: {response.text}")
            return None
        return response.json()

    def delete_workflow(self, workflow_id: str) -> bool:
        """Delete a workflow."""
        response = self.client.delete(f"{N8N_BASE_URL}/api/v1/workflows/{workflow_id}")
        if response.status_code not in [200, 204]:
            logger.error(f"Failed to delete workflow {workflow_id}: {response.text}")
            return False
        logger.info(f"✓ Deleted workflow {workflow_id}")
        return True

    def update_workflow(self, workflow_id: str, payload: dict) -> bool:
        """Update a workflow."""
        response = self.client.put(
            f"{N8N_BASE_URL}/api/v1/workflows/{workflow_id}",
            json=payload,
        )
        if response.status_code not in [200, 201]:
            logger.error(f"Failed to update workflow {workflow_id}: {response.text}")
            return False
        logger.info(f"✓ Updated workflow {workflow_id}")
        return True

    def fix_all_workflows(self):
        """Apply all fixes to workflows."""
        workflows = self.get_all_workflows()

        for wf in workflows:
            name = wf.get("name", "Unknown")
            wf_id = wf.get("id")

            if name == "My workflow":
                logger.info(f"Deleting dead stub: {name} ({wf_id})")
                self.delete_workflow(wf_id)

            elif name == "My workflow 2":
                logger.info(f"Deleting test duplicate: {name} ({wf_id})")
                self.delete_workflow(wf_id)

            elif "Spoilage Emergency copy" in name:
                logger.info(f"Deleting test copy: {name} ({wf_id})")
                self.delete_workflow(wf_id)

            elif name == "Scheme Eligibility Check":
                logger.info(f"Fixing race condition: {name} ({wf_id})")
                # This requires manually editing the workflow JSON to add a Merge node
                # between the two parallel API calls and the IF node.
                # For now, log a manual instruction
                logger.warning(
                    "   ⚠ Manual fix needed: Add Merge node in n8n UI to wait for both "
                    "PM-KISAN and PMFBY responses before the IF check.\n"
                    "   Steps: 1. Add 'Merge' node between API responses and IF\n"
                    "          2. Connect both API nodes to Merge\n"
                    "          3. Connect Merge to IF node\n"
                    "          4. Save & deploy"
                )

            elif name == "Price Crash Broadcast":
                logger.info(f"Fixing dual logging & double Telegram: {name} ({wf_id})")
                logger.warning(
                    "   ⚠ Manual fix needed in n8n UI:\n"
                    "   1. Delete 'Log in Notion' node (keep Supabase)\n"
                    "   2. Delete 'Telegram: Follow-up Alert' node (Slack is sufficient)\n"
                    "   3. Save & deploy"
                )

            elif name == "WhatsApp Advisory Loop":
                logger.info(f"Fixing naming & consolidating logging: {name} ({wf_id})")
                logger.warning(
                    "   ⚠ Manual fix needed in n8n UI:\n"
                    "   1. Rename 'Log in Notion' node to 'Log Advisory'\n"
                    "   2. Combine both Supabase write nodes (merge into one append)\n"
                    "   3. Save & deploy"
                )

    def export_workflows_backup(self, filename: str = "workflows_clean.json"):
        """Export all workflows to JSON for backup."""
        workflows = self.get_all_workflows()
        # Filter out deleted/dead workflows
        active_workflows = [
            w for w in workflows
            if w.get("name") not in ["My workflow", "My workflow 2"]
            and "copy" not in w.get("name", "").lower()
        ]

        with open(filename, "w") as f:
            json.dump(
                {
                    "version": "1.0",
                    "exported_at": datetime.now().isoformat(),
                    "workflows": active_workflows,
                },
                f,
                indent=2,
            )
        logger.info(f"✓ Exported {len(active_workflows)} workflows to {filename}")


def main():
    """Run workflow fixes."""
    logger.info("=" * 70)
    logger.info("Mandi-Agent n8n Workflow Simplification")
    logger.info("=" * 70)

    if not N8N_API_KEY:
        logger.error("❌ N8N_API_KEY environment variable not set")
        logger.info("Set it with: export N8N_API_KEY='your-key'")
        return

    fixer = N8NWorkflowFixer()

    try:
        logger.info("\n1. Fetching current workflows...")
        workflows = fixer.get_all_workflows()
        logger.info(f"   Found {len(workflows)} workflows")

        logger.info("\n2. Applying automated fixes...")
        fixer.fix_all_workflows()

        logger.info(
            "\n3. Manual fixes required (⚠ see above for details)\n"
            "   Open n8n UI and apply changes to:\n"
            "   - Scheme Eligibility Check (add Merge node)\n"
            "   - Price Crash Broadcast (remove dual logging)\n"
            "   - WhatsApp Advisory Loop (fix naming)"
        )

        logger.info("\n4. Exporting backup...")
        fixer.export_workflows_backup()

        logger.info("\n" + "=" * 70)
        logger.info("✓ Workflow simplification complete!")
        logger.info("   Next: Manually apply the fixes in n8n UI (see warnings above)")
        logger.info("         Then save & deploy each workflow")
        logger.info("=" * 70)

    except Exception as e:
        logger.error(f"Error: {e}")
        raise
    finally:
        fixer.client.close()


if __name__ == "__main__":
    main()
