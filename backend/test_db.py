import unittest
import os
import sqlite3
import database

class TestDatabase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # We will use the same SQLite DB, but we can register distinct test IDs
        database.init_db()

    def test_create_and_retrieve_patient(self):
        patient_id = "TEST-PID-999"
        # Cleanup first if it exists from a previous run
        conn = database.get_db_connection()
        conn.execute("DELETE FROM scans WHERE patient_id = ?", (patient_id,))
        conn.execute("DELETE FROM patients WHERE patient_id = ?", (patient_id,))
        conn.commit()
        conn.close()

        # Create
        p = database.create_patient(patient_id, "Test Case Patient", 45, "Female", "Pre-existing diabetes")
        self.assertEqual(p["patient_id"], patient_id)
        self.assertEqual(p["name"], "Test Case Patient")

        # Duplicate check should raise ValueError
        with self.assertRaises(ValueError):
            database.create_patient(patient_id, "Duplicate", 20, "Other")

        # Retrieve List
        patients = database.get_patients()
        self.assertTrue(len(patients) > 0)
        self.assertTrue(any(pat["patient_id"] == patient_id for pat in patients))

        # Retrieve Single
        detail = database.get_patient(patient_id)
        self.assertIsNotNone(detail)
        self.assertEqual(detail["name"], "Test Case Patient")
        self.assertEqual(len(detail["scans"]), 0)

        # Add scan
        scan = database.add_scan(patient_id, "brain-mri", "Glioma", 0.98, "/mask.png", "/heat.png", "A brain scan report.")
        self.assertEqual(scan["patient_id"], patient_id)
        self.assertEqual(scan["prediction"], "Glioma")

        # Retrieve Detail with Scan
        detail_with_scan = database.get_patient(patient_id)
        self.assertEqual(len(detail_with_scan["scans"]), 1)
        self.assertEqual(detail_with_scan["scans"][0]["modality"], "brain-mri")
        self.assertEqual(detail_with_scan["scans"][0]["llm_report"], "A brain scan report.")

        # Update scan report
        updated = database.update_scan_report(scan["id"], "An updated clinical report.")
        self.assertTrue(updated)
        
        detail_after_update = database.get_patient(patient_id)
        self.assertEqual(detail_after_update["scans"][0]["llm_report"], "An updated clinical report.")

        # Cleanup
        conn = database.get_db_connection()
        conn.execute("DELETE FROM scans WHERE patient_id = ?", (patient_id,))
        conn.execute("DELETE FROM patients WHERE patient_id = ?", (patient_id,))
        conn.commit()
        conn.close()

if __name__ == "__main__":
    unittest.main()
