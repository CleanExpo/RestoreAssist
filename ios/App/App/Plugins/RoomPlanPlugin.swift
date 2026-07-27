import Foundation
import UIKit
import Capacitor
#if canImport(RoomPlan)
import RoomPlan
import simd
#endif

/**
 RA-7091 Phase 2 — present RoomCaptureView, return CapturedRoom-shaped JSON.

 Resolves the pending Capacitor call with `{ room: { rooms: [...] } }` matching
 `lib/sketch/roomplan-to-fabric.ts`, or rejects with a machine-readable code:
 unsupported | already_in_progress | cancelled | permission_denied | capture_failed.
 */
@objc(RoomPlanPlugin)
public class RoomPlanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RoomPlanPlugin"
    public let jsName = "RoomPlan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startCapture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelCapture", returnType: CAPPluginReturnPromise),
    ]

    private var activeHost: RoomPlanCaptureHostController?

    @objc func isSupported(_ call: CAPPluginCall) {
        #if canImport(RoomPlan)
        if #available(iOS 16.0, *) {
            call.resolve(["supported": RoomCaptureSession.isSupported])
            return
        }
        #endif
        call.resolve(["supported": false])
    }

    @objc func startCapture(_ call: CAPPluginCall) {
        #if canImport(RoomPlan)
        if #available(iOS 16.0, *) {
            guard RoomCaptureSession.isSupported else {
                call.reject("RoomPlan is not supported on this device", "unsupported")
                return
            }
            guard activeHost == nil else {
                call.reject("A RoomPlan capture is already in progress", "already_in_progress")
                return
            }
            guard let presenter = bridge?.viewController else {
                call.reject("No view controller available to present RoomPlan", "capture_failed")
                return
            }

            let host = RoomPlanCaptureHostController()
            host.modalPresentationStyle = .fullScreen
            host.onFinished = { [weak self] result in
                guard let self else { return }
                self.activeHost = nil
                switch result {
                case .success(let payload):
                    call.resolve(["room": payload])
                case .failure(let err):
                    call.reject(err.message, err.code)
                }
            }
            self.activeHost = host

            DispatchQueue.main.async {
                presenter.present(host, animated: true, completion: nil)
            }
            return
        }
        #endif
        call.reject("RoomPlan requires iOS 16+ with LiDAR", "unsupported")
    }

    @objc func cancelCapture(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let host = self.activeHost else {
                call.resolve(["cancelled": false])
                return
            }
            host.cancelFromBridge()
            call.resolve(["cancelled": true])
        }
    }
}

#if canImport(RoomPlan)
@available(iOS 16.0, *)
enum RoomPlanCaptureFailure: Error {
    case cancelled
    case permissionDenied
    case captureFailed(String)

    var code: String {
        switch self {
        case .cancelled: return "cancelled"
        case .permissionDenied: return "permission_denied"
        case .captureFailed: return "capture_failed"
        }
    }

    var message: String {
        switch self {
        case .cancelled: return "RoomPlan capture cancelled"
        case .permissionDenied: return "Camera or world-sensing permission denied"
        case .captureFailed(let detail): return detail
        }
    }
}

@available(iOS 16.0, *)
final class RoomPlanCaptureHostController: UIViewController, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
    var onFinished: ((Result<[String: Any], RoomPlanCaptureFailure>) -> Void)?

    private let captureView = RoomCaptureView(frame: .zero)
    private var finalResults: CapturedRoom?
    private var isFinalizing = false
    private var didFinish = false

    private lazy var cancelButton: UIButton = {
        var config = UIButton.Configuration.filled()
        config.title = "Cancel"
        config.baseBackgroundColor = UIColor.black.withAlphaComponent(0.55)
        config.baseForegroundColor = .white
        config.cornerStyle = .capsule
        let button = UIButton(configuration: config)
        button.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        return button
    }()

    private lazy var doneButton: UIButton = {
        var config = UIButton.Configuration.filled()
        config.title = "Done"
        config.baseBackgroundColor = UIColor(red: 0.11, green: 0.18, blue: 0.28, alpha: 1) // brand primary
        config.baseForegroundColor = .white
        config.cornerStyle = .capsule
        let button = UIButton(configuration: config)
        button.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        return button
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        captureView.translatesAutoresizingMaskIntoConstraints = false
        captureView.delegate = self
        // Session updates give us a live CapturedRoom; stop() triggers processing.
        captureView.captureSession.delegate = self
        view.addSubview(captureView)

        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cancelButton)
        view.addSubview(doneButton)

        NSLayoutConstraint.activate([
            captureView.topAnchor.constraint(equalTo: view.topAnchor),
            captureView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            captureView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            captureView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            cancelButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),

            doneButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            doneButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            doneButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 140),
            doneButton.heightAnchor.constraint(equalToConstant: 48),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        var configuration = RoomCaptureSession.Configuration()
        configuration.isCoachingEnabled = true
        captureView.captureSession.run(configuration: configuration)
    }

    func cancelFromBridge() {
        cancelTapped()
    }

    @objc private func cancelTapped() {
        guard !didFinish else { return }
        isFinalizing = true
        captureView.captureSession.stop()
        finish(.failure(.cancelled))
    }

    @objc private func doneTapped() {
        guard !didFinish, !isFinalizing else { return }
        isFinalizing = true
        doneButton.isEnabled = false
        cancelButton.isEnabled = false
        captureView.captureSession.stop()
        // Final payload arrives via captureView(didPresent:) or session didEndWith fallback.
    }

    // MARK: - RoomCaptureViewDelegate

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: (any Error)?) -> Bool {
        if let error {
            let message = error.localizedDescription.lowercased()
            if message.contains("permission") || message.contains("authorized") {
                finish(.failure(.permissionDenied))
                return false
            }
            finish(.failure(.captureFailed(error.localizedDescription)))
            return false
        }
        // Allow RoomPlan to build the CapturedRoom, then didPresent fires.
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: (any Error)?) {
        if let error {
            finish(.failure(.captureFailed(error.localizedDescription)))
            return
        }
        finalResults = processedResult
        let payload = RoomPlanJSON.encode(processedResult)
        if let rooms = payload["rooms"] as? [[String: Any]], rooms.isEmpty {
            finish(.failure(.captureFailed("Capture produced no usable floor geometry")))
            return
        }
        finish(.success(payload))
    }

    // MARK: - RoomCaptureSessionDelegate

    func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        finalResults = room
    }

    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: (any Error)?) {
        if let error {
            // cancel path already finishes; avoid double-complete
            if !didFinish && isFinalizing {
                let message = error.localizedDescription.lowercased()
                if message.contains("cancel") {
                    finish(.failure(.cancelled))
                } else if message.contains("permission") || message.contains("authorized") {
                    finish(.failure(.permissionDenied))
                } else {
                    finish(.failure(.captureFailed(error.localizedDescription)))
                }
            }
            return
        }

        // Success path normally arrives via captureView(didPresent:).
        // Fallback: build CapturedRoom from raw session data if the view
        // delegate never delivers (edge devices / interrupted processing).
        guard !didFinish, isFinalizing else { return }
        Task { [weak self] in
            guard let self else { return }
            do {
                let builder = RoomBuilder(options: [.beautifyObjects])
                let room = try await builder.capturedRoom(from: data)
                let payload = RoomPlanJSON.encode(room)
                await MainActor.run {
                    if let rooms = payload["rooms"] as? [[String: Any]], rooms.isEmpty {
                        self.finish(.failure(.captureFailed("Capture produced no usable floor geometry")))
                    } else {
                        self.finish(.success(payload))
                    }
                }
            } catch {
                await MainActor.run {
                    // Prefer live didUpdate snapshot if RoomBuilder fails.
                    if let finalResults = self.finalResults {
                        let payload = RoomPlanJSON.encode(finalResults)
                        if let rooms = payload["rooms"] as? [[String: Any]], !rooms.isEmpty {
                            self.finish(.success(payload))
                            return
                        }
                    }
                    self.finish(.failure(.captureFailed(error.localizedDescription)))
                }
            }
        }
    }

    private func finish(_ result: Result<[String: Any], RoomPlanCaptureFailure>) {
        guard !didFinish else { return }
        didFinish = true
        dismiss(animated: true) { [weak self] in
            self?.onFinished?(result)
            self?.onFinished = nil
        }
    }
}

@available(iOS 16.0, *)
enum RoomPlanJSON {
    /// Shape consumed by `lib/sketch/roomplan-to-fabric.ts` (+ extras for later phases).
    static func encode(_ room: CapturedRoom) -> [String: Any] {
        var roomsPayload: [[String: Any]] = []

        if #available(iOS 17.0, *) {
            for (index, floor) in room.floors.enumerated() {
                let polygon = polygonFromSurface(floor)
                guard polygon.count >= 3 else { continue }
                let label = sectionLabel(for: room, index: index) ?? "Room \(index + 1)"
                roomsPayload.append([
                    "label": label,
                    "category": "floor",
                    "floorPolygon": polygon,
                ])
            }
        }

        // iOS 16 (or empty floors): approximate a floor ring from wall footprints.
        if roomsPayload.isEmpty {
            let polygon = floorPolygonFromWalls(room.walls)
            if polygon.count >= 3 {
                roomsPayload.append([
                    "label": "Scanned Room",
                    "category": "floor",
                    "floorPolygon": polygon,
                ])
            }
        }

        return [
            "identifier": room.identifier.uuidString,
            "rooms": roomsPayload,
            "walls": room.walls.map { encodeSurface($0, fallbackCategory: "wall") },
            "doors": room.doors.map { encodeSurface($0, fallbackCategory: "door") },
            "windows": room.windows.map { encodeSurface($0, fallbackCategory: "window") },
            "openings": room.openings.map { encodeSurface($0, fallbackCategory: "opening") },
            "objects": room.objects.map { encodeObject($0) },
        ]
    }

    @available(iOS 17.0, *)
    private static func sectionLabel(for room: CapturedRoom, index: Int) -> String? {
        guard index < room.sections.count else { return nil }
        return prettySectionLabel(room.sections[index].label)
    }

    @available(iOS 17.0, *)
    private static func prettySectionLabel(_ label: CapturedRoom.Section.Label) -> String {
        switch label {
        case .livingRoom: return "Living Room"
        case .bedroom: return "Bedroom"
        case .bathroom: return "Bathroom"
        case .kitchen: return "Kitchen"
        case .diningRoom: return "Dining Room"
        case .unidentified: return "Room"
        @unknown default: return "Room"
        }
    }

    private static func polygonFromSurface(_ surface: CapturedRoom.Surface) -> [[String: Double]] {
        if #available(iOS 17.0, *) {
            let corners = surface.polygonCorners
            if !corners.isEmpty {
                return corners.map { corner in
                    let world = surface.transform * SIMD4<Float>(corner.x, corner.y, corner.z, 1)
                    return pointDict(x: world.x, y: world.y, z: world.z)
                }
            }
        }
        return rectangleFootprint(for: surface)
    }

    private static func encodeSurface(
        _ surface: CapturedRoom.Surface,
        fallbackCategory: String,
    ) -> [String: Any] {
        [
            "category": surfaceCategoryName(surface.category) ?? fallbackCategory,
            "identifier": surface.identifier.uuidString,
            "dimensions": [
                "x": Double(surface.dimensions.x),
                "y": Double(surface.dimensions.y),
                "z": Double(surface.dimensions.z),
            ],
            "polygon": polygonFromSurface(surface),
        ]
    }

    private static func encodeObject(_ object: CapturedRoom.Object) -> [String: Any] {
        [
            "category": String(describing: object.category),
            "identifier": object.identifier.uuidString,
            "dimensions": [
                "x": Double(object.dimensions.x),
                "y": Double(object.dimensions.y),
                "z": Double(object.dimensions.z),
            ],
        ]
    }

    private static func surfaceCategoryName(_ category: CapturedRoom.Surface.Category) -> String? {
        switch category {
        case .wall: return "wall"
        case .opening: return "opening"
        case .window: return "window"
        case .door: return "door"
        default:
            if #available(iOS 17.0, *) {
                if category == .floor { return "floor" }
            }
            return nil
        }
    }

    /// Bottom-edge rectangle of a wall/surface projected into world XZ (metres).
    private static func rectangleFootprint(for surface: CapturedRoom.Surface) -> [[String: Double]] {
        let width = surface.dimensions.x
        let height = surface.dimensions.y
        let locals: [SIMD3<Float>] = [
            SIMD3(-width / 2, -height / 2, 0),
            SIMD3(width / 2, -height / 2, 0),
            SIMD3(width / 2, height / 2, 0),
            SIMD3(-width / 2, height / 2, 0),
        ]
        return locals.map { local in
            let world = surface.transform * SIMD4<Float>(local.x, local.y, local.z, 1)
            return pointDict(x: world.x, y: world.y, z: world.z)
        }
    }

    /// Order wall bottom endpoints around their centroid to form a simple floor ring.
    private static func floorPolygonFromWalls(_ walls: [CapturedRoom.Surface]) -> [[String: Double]] {
        var points: [(Float, Float)] = []
        for wall in walls {
            let width = wall.dimensions.x
            let height = wall.dimensions.y
            let ends: [SIMD3<Float>] = [
                SIMD3(-width / 2, -height / 2, 0),
                SIMD3(width / 2, -height / 2, 0),
            ]
            for local in ends {
                let world = wall.transform * SIMD4<Float>(local.x, local.y, local.z, 1)
                points.append((world.x, world.z))
            }
        }
        guard points.count >= 3 else { return [] }

        // Deduplicate near-identical corners (walls share endpoints).
        var unique: [(Float, Float)] = []
        for p in points {
            if unique.contains(where: { hypot($0.0 - p.0, $0.1 - p.1) < 0.05 }) { continue }
            unique.append(p)
        }
        guard unique.count >= 3 else { return [] }

        let cx = unique.map(\.0).reduce(0, +) / Float(unique.count)
        let cz = unique.map(\.1).reduce(0, +) / Float(unique.count)
        let ordered = unique.sorted { a, b in
            atan2(a.1 - cz, a.0 - cx) < atan2(b.1 - cz, b.0 - cx)
        }
        return ordered.map { pointDict(x: $0.0, y: 0, z: $0.1) }
    }

    private static func pointDict(x: Float, y: Float, z: Float) -> [String: Double] {
        ["x": Double(x), "y": Double(y), "z": Double(z)]
    }
}
#endif
