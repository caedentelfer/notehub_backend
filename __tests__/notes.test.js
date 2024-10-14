const request = require('supertest');
const app = require('../server');  // Adjust this path if necessary
const { v4: uuidv4 } = require('uuid');

describe('User API', () => {
  let testUser;
  let authToken;

  beforeAll(async () => {
    // Create a test user to be used across all tests
    testUser = {
      username: `testuser${uuidv4().replace(/-/g, '')}`,
      email: `testuser_${uuidv4()}@example.com`,
      password: 'testPassword123!'
    };

    // Register the test user
    try {
      const registerResponse = await request(app)
        .post('/api/users/register')
        .send(testUser);

      console.log('Test user registration response:', JSON.stringify(registerResponse.body, null, 2));

      if (registerResponse.body && registerResponse.body.user && registerResponse.body.user.user_id) {
        testUser.id = registerResponse.body.user.user_id;
      } else if (registerResponse.body && registerResponse.body.user_id) {
        testUser.id = registerResponse.body.user_id;
      } else {
        console.error('Unexpected registration response structure:', registerResponse.body);
        throw new Error('Failed to extract user_id from registration response');
      }
    } catch (error) {
      console.error('Error during test user registration:', error);
      throw error; // Re-throw the error to fail the test suite
    }
  });

  
  it('should login a user successfully', async () => {
    // Ensure testUser has been properly set up
    if (!testUser || !testUser.username || !testUser.password) {
      console.error('Test user not properly set up:', testUser);
      throw new Error('Test user not properly set up');
    }

    const res = await request(app)
      .post('/api/users/login')
      .send({
        username: testUser.username,
        password: testUser.password
      });

    console.log('Login response:', JSON.stringify(res.body, null, 2));

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('user_id');
    authToken = res.body.token;
  });

  
});