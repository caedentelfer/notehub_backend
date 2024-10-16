import request from 'supertest';
import {app, server} from '../server';
import { v4 as uuidv4 } from 'uuid';


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

  it('should not allow registering with an existing username or email', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({
        username: testUser.username,  // Use the same username as the test user
        email: testUser.email,        // Use the same email as the test user
        password: 'anotherPassword123!'
      });
  
    expect(res.statusCode).toEqual(400);  //400 is used for bad request
    expect(res.body).toHaveProperty('error', 'Username already exists.');
  });
  
  it('should not login with incorrect credentials', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({
        username: testUser.username,
        password: 'wrongPassword'
      });
  
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Invalid username or password.');
  });

  it('should not allow access to the user profile without a token', async () => {
    const res = await request(app)
      .get(`/api/users/profile`);  
  
    expect(res.statusCode).toEqual(401);  // 401 is used for unauthorized
    expect(res.body).toHaveProperty('error', 'Access denied. No token provided.');
  });

  it('should not allow registering with an invalid email format', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({
        username: `testuser${uuidv4().replace(/-/g, '')}`,
        email: 'invalidemail',  // Invalid email format
        password: 'testPassword123!'
      });
  
    expect(res.statusCode).toEqual(400);  
    expect(res.body).toHaveProperty('error', 'Invalid email format.');
  });
  

  it('should not allow registering with missing fields', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({
        email: `testuser_${uuidv4()}@example.com`,
        password: 'testPassword123!'
      });
  
    expect(res.statusCode).toEqual(400);  
    expect(res.body).toHaveProperty('error', 'Username, email, and password are required.');
  });

  it('should allow registering with a strong password', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({
        username: `testuser${uuidv4().replace(/-/g, '')}`,
        email: `testuser_${uuidv4()}@example.com`,
        password: '$$Tr0ngPa$$w0%d'  // strong password
      });
  
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('message', 'User registered successfully.');
  });


  afterAll(() => {
    // Add this to close the server
    server.close();
  });
  
});