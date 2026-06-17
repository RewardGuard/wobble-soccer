/**
 * Tunable constants for the simulation.  Mirrors the Python core
 * (`wobblesoccer/core/config.py`) so the browser game and the RL env share the
 * same rules.  Coordinate system: x = goal-to-goal, z = across pitch, y = up.
 * Team 0 (red) attacks +x; team 1 (blue) attacks -x.
 */
export const C = {
  // pitch (full-size feel for 11-a-side)
  HALF_LENGTH: 34.0,
  HALF_WIDTH: 22.0,
  GOAL_HALF_WIDTH: 5.5,
  GOAL_HEIGHT: 4.0,
  WALL_RESTITUTION: 0.6,

  // ball
  BALL_RADIUS: 0.4,
  GRAVITY: 26.0,
  GROUND_RESTITUTION: 0.5,
  BALL_GROUND_DAMP: 0.985, // less friction so the ball travels on a big pitch
  BALL_AIR_DAMP: 0.999,

  // players
  PLAYER_RADIUS: 0.6,
  PLAYER_MAX_SPEED: 13.0,
  PLAYER_ACCEL: 85.0,
  PLAYER_PUSH: 0.6,

  // possession / dribbling
  CAPTURE_RADIUS: 1.45,
  CAPTURE_HEIGHT: 1.8,
  DRIBBLE_OFFSET: 1.1,
  KICK_COOLDOWN: 0.3,

  // goalkeeper (can pluck high balls inside its own box)
  GK_REACH: 1.95,
  GK_CATCH_HEIGHT: 4.0,
  GK_SPEED_BONUS: 1.04,

  // kicks (power scales with aim magnitude in [0,1])
  PASS_SPEED_MIN: 14.0,
  PASS_SPEED_MAX: 26.0,
  PASS_LOFT: 1.0,
  SHOOT_SPEED_MIN: 22.0,
  SHOOT_SPEED_MAX: 40.0,
  SHOOT_LOFT: 2.0,

  // AI
  SHOOT_RANGE: 16.0,
  AIM_NOISE: 0.05,
  CHASE_LEAD: 0.2,

  // match
  DT: 1.0 / 30.0, // fixed 30 Hz sim; the renderer interpolates to 60fps
  MATCH_SECONDS: 180.0,
  TEAM_SIZE: 11,
};
