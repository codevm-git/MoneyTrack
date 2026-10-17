import json
from app.database.connection import get_db_connection

class LearningService:
    def __init__(self, db_path=None):
        self.db_path = db_path

    def _get_conn(self):
        return get_db_connection(self.db_path)

    def get_lessons(self):
        conn = self._get_conn()
        try:
            rows = conn.execute("SELECT * FROM lessons ORDER BY order_index ASC;").fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def get_quizzes_for_lesson(self, lesson_id):
        conn = self._get_conn()
        try:
            rows = conn.execute("SELECT * FROM quizzes WHERE lesson_id = ? ORDER BY id ASC;", (lesson_id,)).fetchall()
            quizzes = []
            for r in rows:
                quizzes.append({
                    'id': r['id'],
                    'lesson_id': r['lesson_id'],
                    'question': r['question'],
                    'options': json.loads(r['options_json']),
                    'correct_index': r['correct_index'],
                    'explanation': r['explanation']
                })
            return quizzes
        finally:
            conn.close()

    def submit_quiz_answer(self, profile_id, quiz_id, selected_index):
        conn = self._get_conn()
        try:
            quiz = conn.execute("SELECT * FROM quizzes WHERE id = ?;", (quiz_id,)).fetchone()
            if not quiz:
                return {'error': 'Quiz question not found'}

            is_correct = (int(selected_index) == int(quiz['correct_index']))
            return {
                'quiz_id': quiz['id'],
                'is_correct': is_correct,
                'correct_index': quiz['correct_index'],
                'explanation': quiz['explanation']
            }
        finally:
            conn.close()

    def record_quiz_completion(self, profile_id, lesson_id, score, total):
        conn = self._get_conn()
        try:
            with conn:
                conn.execute("""
                    INSERT INTO user_quiz_results (profile_id, lesson_id, score, total)
                    VALUES (?, ?, ?, ?);
                """, (profile_id, lesson_id, score, total))

                # Check if 100% score unlocks Quiz Scholar achievement
                if score == total and total > 0:
                    conn.execute("""
                        INSERT OR IGNORE INTO user_achievements (profile_id, achievement_id)
                        SELECT ?, id FROM achievements WHERE code = 'quiz_scholar';
                    """, (profile_id,))
            return True
        finally:
            conn.close()

    def get_achievements(self, profile_id=1):
        conn = self._get_conn()
        try:
            all_achievements = conn.execute("SELECT * FROM achievements ORDER BY id ASC;").fetchall()
            unlocked_rows = conn.execute("SELECT achievement_id FROM user_achievements WHERE profile_id = ?;", (profile_id,)).fetchall()
            unlocked_set = {r['achievement_id'] for r in unlocked_rows}

            result = []
            for a in all_achievements:
                result.append({
                    'id': str(a['id']),
                    'code': a['code'],
                    'title': a['title'],
                    'desc': a['description'],
                    'icon': a['icon'],
                    'unlocked': (a['id'] in unlocked_set)
                })
            return result
        finally:
            conn.close()
