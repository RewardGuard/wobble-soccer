/**
 * Tunable constants for the simulation.  Mirrors the Python core
 * (`wobblesoccer/core/config.py`) so the browser game and the RL env share the
 * same rules.  Coordinate system: x = goal-to-goal, z = across pitch, y = up.
 * Team 0 (red) attacks +x; team 1 (blue) attacks -x.
 */
export const C = {
  // pitch (spacious 11-a-side; camera is pulled well back to show it)
  HALF_LENGTH: 42.0,
  HALF_WIDTH: 27.0,
  GOAL_HALF_WIDTH: 6.5,
  GOAL_HEIGHT: 4.2,
  WALL_RESTITUTION: 0.6,

  // ball
  BALL_RADIUS: 0.45,
  GRAVITY: 28.0,
  GROUND_RESTITUTION: 0.5,
  BALL_GROUND_DAMP: 0.988,
  BALL_AIR_DAMP: 0.999,

  // players
  PLAYER_RADIUS: 0.7,
  PLAYER_MAX_SPEED: 15.5,
  PLAYER_ACCEL: 95.0,
  PLAYER_PUSH: 0.6,

  // possession / dribbling
  CAPTURE_RADIUS: 1.55,
  CAPTURE_HEIGHT: 1.9,
  DRIBBLE_OFFSET: 1.15,
  KICK_COOLDOWN: 0.3,

  // human controls
  SPRINT_MULT: 1.45, // controlled player speed boost while holding Shift
  TACKLE_RANGE: 1.4, // how close the human gets to a carrier to win the ball

  // goalkeeper (can pluck high balls inside its own box)
  GK_REACH: 1.55,
  GK_CATCH_HEIGHT: 4.2,
  GK_SPEED_BONUS: 1.0,

  // kicks (power scales with aim magnitude in [0,1])
  PASS_SPEED_MIN: 18.0,
  PASS_SPEED_MAX: 32.0,
  PASS_LOFT: 1.1,
  SHOOT_SPEED_MIN: 27.0,
  SHOOT_SPEED_MAX: 46.0,
  SHOOT_LOFT: 2.2,

  // AI
  SHOOT_RANGE: 28.0,
  AIM_NOISE: 0.045,
  CHASE_LEAD: 0.22,

  // match
  DT: 1.0 / 30.0, // fixed 30 Hz sim; the renderer interpolates to 60fps
  MATCH_SECONDS: 180.0,
  TEAM_SIZE: 11,
};
