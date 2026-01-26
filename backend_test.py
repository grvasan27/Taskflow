#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timezone, timedelta
import uuid

class TaskFlowAPITester:
    def __init__(self, base_url="https://taskflow-tracker-23.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, success, details="", response_data=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name}")
        else:
            print(f"❌ {test_name} - {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response_data": response_data
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if not endpoint.startswith('http') else endpoint
        test_headers = {'Content-Type': 'application/json'}
        
        if self.session_token:
            test_headers['Authorization'] = f'Bearer {self.session_token}'
        
        if headers:
            test_headers.update(headers)

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            response_data = None
            
            try:
                response_data = response.json()
            except:
                response_data = response.text

            if success:
                self.log_result(name, True, f"Status: {response.status_code}", response_data)
            else:
                self.log_result(name, False, f"Expected {expected_status}, got {response.status_code}", response_data)

            return success, response_data

        except Exception as e:
            self.log_result(name, False, f"Error: {str(e)}")
            return False, {}

    def test_health_endpoints(self):
        """Test basic health endpoints"""
        print("\n=== TESTING HEALTH ENDPOINTS ===")
        
        # Test root endpoint
        self.run_test("API Root", "GET", "", 200)
        
        # Test health endpoint
        self.run_test("Health Check", "GET", "health", 200)

    def test_unauthenticated_endpoints(self):
        """Test endpoints that should work without auth"""
        print("\n=== TESTING UNAUTHENTICATED ACCESS ===")
        
        # These should fail with 401
        self.run_test("Auth Me (No Token)", "GET", "auth/me", 401)
        self.run_test("Get Tasks (No Token)", "GET", "tasks", 401)

    def create_test_user_and_session(self):
        """Create test user and session in MongoDB for testing"""
        print("\n=== CREATING TEST USER AND SESSION ===")
        
        # Generate test data
        timestamp = int(datetime.now().timestamp())
        self.user_id = f"test-user-{timestamp}"
        email = f"test.user.{timestamp}@example.com"
        self.session_token = f"test_session_{timestamp}"
        
        # MongoDB commands to create test user and session
        mongo_commands = f"""
use('test_database');
db.users.insertOne({{
  user_id: '{self.user_id}',
  email: '{email}',
  name: 'Test User {timestamp}',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
}});
db.user_sessions.insertOne({{
  user_id: '{self.user_id}',
  session_token: '{self.session_token}',
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
}});
print('Test user and session created successfully');
"""
        
        try:
            import subprocess
            result = subprocess.run(
                ['mongosh', '--eval', mongo_commands],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                print(f"✅ Created test user: {self.user_id}")
                print(f"✅ Created session token: {self.session_token}")
                return True
            else:
                print(f"❌ MongoDB command failed: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ Error creating test user: {str(e)}")
            return False

    def test_authenticated_endpoints(self):
        """Test endpoints that require authentication"""
        print("\n=== TESTING AUTHENTICATED ENDPOINTS ===")
        
        # Test auth/me
        success, user_data = self.run_test("Get Current User", "GET", "auth/me", 200)
        if success and user_data:
            print(f"   User ID: {user_data.get('user_id')}")
            print(f"   Email: {user_data.get('email')}")

        # Test logout
        self.run_test("Logout", "POST", "auth/logout", 200)

    def test_task_crud(self):
        """Test task CRUD operations"""
        print("\n=== TESTING TASK CRUD OPERATIONS ===")
        
        # Create task
        task_data = {
            "name": f"Test Task {datetime.now().strftime('%H:%M:%S')}",
            "reminder_time": "09:00",
            "start_date": "2025-01-01",
            "end_date": "2025-01-31"
        }
        
        success, created_task = self.run_test("Create Task", "POST", "tasks", 200, task_data)
        
        if not success or not created_task:
            print("❌ Cannot continue task tests - task creation failed")
            return None
            
        task_id = created_task.get('task_id')
        print(f"   Created task ID: {task_id}")
        
        # Get all tasks
        self.run_test("Get All Tasks", "GET", "tasks", 200)
        
        # Get specific task
        self.run_test("Get Specific Task", "GET", f"tasks/{task_id}", 200)
        
        # Update task
        update_data = {"name": "Updated Test Task"}
        self.run_test("Update Task", "PUT", f"tasks/{task_id}", 200, update_data)
        
        # Update daily progress
        progress_data = {"date": "2025-01-15", "value": "Chapter 1 completed"}
        self.run_test("Update Daily Progress", "PUT", f"tasks/{task_id}/progress", 200, progress_data)
        
        return task_id

    def test_subtask_crud(self, task_id):
        """Test subtask CRUD operations"""
        if not task_id:
            print("\n❌ Skipping subtask tests - no valid task ID")
            return
            
        print("\n=== TESTING SUBTASK CRUD OPERATIONS ===")
        
        # Create subtask
        subtask_data = {
            "name": f"Test Subtask {datetime.now().strftime('%H:%M:%S')}",
            "date": "2025-01-15",
            "completed": False
        }
        
        success, created_subtask = self.run_test("Create Subtask", "POST", f"tasks/{task_id}/subtasks", 201, subtask_data)
        
        if not success or not created_subtask:
            print("❌ Cannot continue subtask tests - subtask creation failed")
            return
            
        subtask_id = created_subtask.get('subtask_id')
        print(f"   Created subtask ID: {subtask_id}")
        
        # Get all subtasks for task
        self.run_test("Get Task Subtasks", "GET", f"tasks/{task_id}/subtasks", 200)
        
        # Update subtask
        update_data = {"completed": True}
        self.run_test("Update Subtask", "PUT", f"subtasks/{subtask_id}", 200, update_data)
        
        # Delete subtask
        self.run_test("Delete Subtask", "DELETE", f"subtasks/{subtask_id}", 200)

    def test_cleanup(self, task_id):
        """Clean up test data"""
        print("\n=== CLEANUP ===")
        
        if task_id:
            self.run_test("Delete Test Task", "DELETE", f"tasks/{task_id}", 200)
        
        # Clean up MongoDB test data
        cleanup_commands = f"""
use('test_database');
db.users.deleteMany({{user_id: '{self.user_id}'}});
db.user_sessions.deleteMany({{user_id: '{self.user_id}'}});
print('Test data cleaned up');
"""
        
        try:
            import subprocess
            result = subprocess.run(
                ['mongosh', '--eval', cleanup_commands],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                print("✅ Test data cleaned up from MongoDB")
            else:
                print(f"⚠️  MongoDB cleanup warning: {result.stderr}")
                
        except Exception as e:
            print(f"⚠️  Error during cleanup: {str(e)}")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting TaskFlow API Tests")
        print(f"Base URL: {self.base_url}")
        print("=" * 50)
        
        # Test basic endpoints
        self.test_health_endpoints()
        self.test_unauthenticated_endpoints()
        
        # Create test user and session
        if not self.create_test_user_and_session():
            print("❌ Cannot continue - failed to create test user")
            return False
        
        # Test authenticated endpoints
        self.test_authenticated_endpoints()
        
        # Test CRUD operations
        task_id = self.test_task_crud()
        self.test_subtask_crud(task_id)
        
        # Cleanup
        self.test_cleanup(task_id)
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 FINAL RESULTS: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed. Check details above.")
            return False

def main():
    tester = TaskFlowAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    results = {
        "timestamp": datetime.now().isoformat(),
        "total_tests": tester.tests_run,
        "passed_tests": tester.tests_passed,
        "success_rate": f"{(tester.tests_passed/tester.tests_run*100):.1f}%" if tester.tests_run > 0 else "0%",
        "test_details": tester.test_results
    }
    
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: /app/backend_test_results.json")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())