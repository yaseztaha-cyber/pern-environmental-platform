import { useDevice } from '../lib/device-context';

export default function DeviceSelector() {
  const { selectedDevice, connectedDevices, setSelectedDevice } = useDevice();

  if (connectedDevices.length <= 1) return null;

  return (
    <select 
      value={selectedDevice?.id || ''}
      onChange={(e) => {
        const device = connectedDevices.find(d => d.id === e.target.value);
        if (device) setSelectedDevice(device);
      }}
      className="bg-white/5 px-3 py-1.5 rounded-2xl text-xs border border-white/10"
    >
      <option value="">All Devices</option>
      {connectedDevices.map(device => (
        <option key={device.id} value={device.id}>
          {device.name}
        </option>
      ))}
    </select>
  );
}