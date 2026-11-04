# Unit Tests (Directive Part N, Section 32)
# Stage 1: Foundation Shell

import unittest
from vocalis_engine import get_engine_status
from vocalis_engine.identity import VoiceIdentityProfile, PerformanceDirection, VoiceDNA, PERSONALITY_PRESETS
from vocalis_engine.text import TextNormaliser
from vocalis_engine.phonetics import PhonemeConverter
from vocalis_engine.prosody import ProsodyPlanner
from vocalis_engine.articulation import ArticulationPlanner
from vocalis_engine.acoustics import AcousticController
from vocalis_engine.synthesis import AcousticSynthesiser
from vocalis_engine.refinement import LearningSystem
from vocalis_engine.audio import AudioProcessor

class TestVocalisFoundation(unittest.TestCase):
    
    def test_engine_status(self):
        """Test Stage 1 Foundation status"""
        status = get_engine_status()
        self.assertEqual(status["version"], "2.0.0")
        self.assertEqual(status["stage"], 1)
        self.assertEqual(status["status"], "foundation_established")
        self.assertTrue(status["independence_compliance"]["piper_free"])

    def test_voice_dna_structure(self):
        """Test Voice DNA schema (Directive Part D & L)"""
        identity = VoiceIdentityProfile("test-001", profile_version=1, preset="documentary")
        performance = PerformanceDirection(emotion="neutral", speaking_pace={"speed": 1.0})
        dna = VoiceDNA(identity, performance)
        
        self.assertEqual(dna.identity_profile.profile_id, "test-001")
        self.assertEqual(dna.identity_profile.profile_version, 1)
        self.assertEqual(dna.performance_direction.data["emotion"], "neutral")
        self.assertTrue(dna.is_consistent()) # Foundation shell returns True

    def test_personality_presets(self):
        """Test Six Initial Personality Starting Points (Directive Part E)"""
        self.assertIn("documentary", PERSONALITY_PRESETS)
        self.assertIn("storyteller", PERSONALITY_PRESETS)
        self.assertIn("conversational", PERSONALITY_PRESETS)
        self.assertIn("news", PERSONALITY_PRESETS)
        self.assertIn("educational", PERSONALITY_PRESETS)
        self.assertIn("audiobook", PERSONALITY_PRESETS)

    def test_module_shells(self):
        """Test foundation shells for all engine modules"""
        self.assertEqual(TextNormaliser().status, "foundation_shell")
        self.assertEqual(PhonemeConverter().status, "foundation_shell")
        self.assertEqual(ProsodyPlanner().status, "foundation_shell")
        self.assertEqual(ArticulationPlanner().status, "foundation_shell")
        self.assertEqual(AcousticController().status, "foundation_shell")
        self.assertEqual(AcousticSynthesiser().status, "foundation_shell")
        self.assertEqual(LearningSystem().status, "foundation_shell")
        self.assertEqual(AudioProcessor().status, "foundation_shell")

if __name__ == "__main__":
    unittest.main()
