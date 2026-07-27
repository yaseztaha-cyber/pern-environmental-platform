const dispatcher = require('../services/notification-dispatcher');

describe('Notification Dispatcher Service', () => {
  it('should export dispatch and setWsBroadcaster functions', () => {
    expect(typeof dispatcher.dispatch).toBe('function');
    expect(typeof dispatcher.setWsBroadcaster).toBe('function');
  });

  it('should handle in-app WebSocket broadcasting when configured', async () => {
    const mockBroadcast = vi.fn();
    dispatcher.setWsBroadcaster(mockBroadcast, () => 1);

    const results = await dispatcher.dispatch({
      title: 'High Turbidity Detected',
      message: 'Turbidity exceeded 15 NTU on River Sensor 1',
      severity: 'critical',
      channels: ['in-app'],
    });

    expect(mockBroadcast).toHaveBeenCalledWith(
      'High Turbidity Detected',
      'Turbidity exceeded 15 NTU on River Sensor 1',
      'critical'
    );
    expect(results).toEqual([{ channel: 'in-app', sent: true }]);
  });
});
