"""Profile CRUD checks against an isolated SQLite database."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('vocalis_api', Path(__file__).resolve().parents[2] / 'apps/api/main.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_path = api.DB_PATH
        api.DB_PATH = os.path.join(self.temp.name, 'test.db')
        api.init_db()
        self.profile = api.VoiceProfile(profile_id='one', name='Original', preset='Storyteller', identity={}, performance_defaults={})

    def tearDown(self):
        api.DB_PATH = self.old_path
        self.temp.cleanup()

    def test_create_read_update_delete(self):
        created = api.create_profile(self.profile)
        self.assertEqual(len(api.list_profiles()), 1)
        self.assertEqual(api.get_profile('one').name, 'Original')
        self.profile.name = 'Renamed'
        updated = api.update_profile('one', self.profile)
        self.assertEqual(updated.created_at, created.created_at)
        self.assertEqual(api.get_profile('one').name, 'Renamed')
        api.delete_profile('one')
        self.assertEqual(api.list_profiles(), [])
        with self.assertRaises(api.HTTPException) as exc:
            api.get_profile('one')
        self.assertEqual(exc.exception.status_code, 404)

    def test_duplicate_id_and_mismatched_update(self):
        api.create_profile(self.profile)
        with self.assertRaises(api.HTTPException) as exc:
            api.create_profile(self.profile)
        self.assertEqual(exc.exception.status_code, 409)
        with self.assertRaises(api.HTTPException) as exc:
            api.update_profile('other', self.profile)
        self.assertEqual(exc.exception.status_code, 400)

if __name__ == '__main__':
    unittest.main()

class VoiceDNAValidationTests(unittest.TestCase):
    def test_defaults_and_bounds(self):
        from pydantic import ValidationError
        profile = api.VoiceProfile(profile_id='test', name='Test', preset='Custom')
        self.assertEqual(profile.identity.pitch.centre, 160)
        self.assertEqual(profile.performance_defaults.speaking_pace.speed, 1)
        for identity in ({'pitch': {'centre': 79}}, {'pitch': {'centre': 801}},
                         {'breathiness': {'intensity': 1.1}}, {'depth': {'resonance_contribution': -0.1}},
                         {'texture': {'intensity': float('nan')}}):
            with self.subTest(identity=identity), self.assertRaises(ValidationError):
                api.VoiceIdentityProfile(**identity)
        for performance in ({'speaking_pace': {'speed': 2.1}}, {'energy': -1}, {'emotion': 'unknown'}):
            with self.subTest(performance=performance), self.assertRaises(ValidationError):
                api.PerformanceDirection(**performance)
        with self.assertRaises(ValidationError):
            api.VoiceProfile(profile_id='test', profile_version=2, name='Test', preset='Custom')

    def test_legacy_values_are_preserved_and_preset_data_is_independent(self):
        legacy = api.VoiceIdentityProfile(pitch={'level': 'high'}, depth={'level': 'low'}, custom={'foo': 1})
        restored = api.VoiceIdentityProfile(**legacy.model_dump())
        self.assertEqual(restored.model_dump()['pitch']['level'], 'high')
        self.assertEqual(restored.model_dump()['custom'], {'foo': 1})
        choices = api.list_presets()
        self.assertEqual(len(choices), 6)
        self.assertNotEqual(choices[0]['identity']['pitch']['centre'], choices[1]['identity']['pitch']['centre'])
        choices[0]['identity']['pitch']['centre'] = 800
        self.assertNotEqual(api.list_presets()[0]['identity']['pitch']['centre'], 800)
