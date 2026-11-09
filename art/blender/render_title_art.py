"""
Renders the placeholder art for the app:
  - icon.png   : the logo die (obsidian d20 with glowing gold numerals) on a transparent background
  - title.jpg  : a wide, moody title-screen image of the die with drifting embers

Run (does NOT touch any Blender file you have open):
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b --factory-startup --python art/blender/render_title_art.py -- <out_dir> [icon|title|all]
"""
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "art/out")
WHICH = argv[1] if len(argv) > 1 else "all"
os.makedirs(OUT, exist_ok=True)
random.seed(7)


# ---------------------------------------------------------------- helpers
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat_principled(name, base, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*base, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if coat:
        p.inputs["Coat Weight"].default_value = coat
        p.inputs["Coat Roughness"].default_value = 0.04
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = emit_strength
    return m


def obsidian_material():
    m = mat_principled("Obsidian", (0.018, 0.012, 0.028), rough=0.16, coat=1.0)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    # subtle smoky variation inside the glossy black
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    noise.inputs["Detail"].default_value = 8.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.012, 0.008, 0.02, 1)
    ramp.color_ramp.elements[1].color = (0.06, 0.03, 0.05, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])
    rr = nt.nodes.new("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = 0.08
    rr.inputs["To Max"].default_value = 0.3
    nt.links.new(noise.outputs["Fac"], rr.inputs["Value"])
    nt.links.new(rr.outputs["Result"], p.inputs["Roughness"])
    return m


def find_font():
    for f in ("georgiab.ttf", "constanb.ttf", "timesbd.ttf", "georgia.ttf"):
        path = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts", f)
        if os.path.exists(path):
            return bpy.data.fonts.load(path)
    return None


def build_d20(radius=1.0):
    """Icosahedron with beveled edges and raised gold numerals; opposite faces sum to 21."""
    root = bpy.data.objects.new("D20", None)
    bpy.context.collection.objects.link(root)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius)
    die = bpy.context.active_object
    die.name = "D20_Body"
    die.parent = root
    die.data.materials.append(obsidian_material())
    bev = die.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.045 * radius
    bev.segments = 4
    bev.limit_method = "ANGLE"
    bpy.ops.object.shade_smooth()

    # face data
    me = die.data
    faces = [(f.center.copy(), f.normal.copy(), me.vertices[f.vertices[0]].co.copy()) for f in me.polygons]
    # pair opposite faces
    numbers = [0] * len(faces)
    used, pairs = set(), []
    for i, (_, n, _) in enumerate(faces):
        if i in used:
            continue
        j = min((k for k in range(len(faces)) if k not in used and k != i),
                key=lambda k: (faces[k][1] + n).length)
        used |= {i, j}
        pairs.append((i, j))
    for idx, (i, j) in enumerate(pairs):
        numbers[i], numbers[j] = idx + 1, 20 - idx

    font = find_font()
    gold = mat_principled("GoldEmber", (1.0, 0.70, 0.30), rough=0.22, metal=1.0,
                          emit=(1.0, 0.45, 0.12), emit_strength=5.0)
    for (c, n, v0), num in zip(faces, numbers):
        label = f"{num}." if num in (6, 9) else str(num)
        curve = bpy.data.curves.new(f"num{num}", "FONT")
        curve.body = label
        if font:
            curve.font = font
        curve.size = 0.42 * radius if num < 10 else 0.36 * radius
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.extrude = 0.012 * radius
        txt = bpy.data.objects.new(f"Num_{num}", curve)
        bpy.context.collection.objects.link(txt)
        txt.data.materials.append(gold)
        z = n.normalized()
        y = (v0 - c)
        y = (y - z * y.dot(z)).normalized()
        x = y.cross(z).normalized()
        rot = Matrix((x, y, z)).transposed().to_4x4()
        txt.matrix_world = Matrix.Translation(c + z * 0.004 * radius) @ rot
        txt.parent = root
        txt.matrix_parent_inverse = root.matrix_world.inverted()
    return root, die, faces, numbers


def aim_face_at(root, faces, numbers, num, target_dir, twist_deg=0.0):
    idx = numbers.index(num)
    n = faces[idx][1].normalized()
    q = n.rotation_difference(target_dir.normalized())
    twist = Matrix.Rotation(math.radians(twist_deg), 4, target_dir.normalized())
    root.matrix_world = twist @ q.to_matrix().to_4x4() @ root.matrix_world


def area_light(name, loc, target, energy, color, size):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = energy
    d.color = color
    d.size = size
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    direction = Vector(target) - Vector(loc)
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return o


def camera(loc, target, lens=85, dof_obj=None, fstop=2.8):
    c = bpy.data.cameras.new("Cam")
    c.lens = lens
    if dof_obj is not None:
        c.dof.use_dof = True
        c.dof.focus_object = dof_obj
        c.dof.aperture_fstop = fstop
    o = bpy.data.objects.new("Cam", c)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = o
    return o


def world(color, strength):
    w = bpy.data.worlds.new("World")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*color, 1)
    bg.inputs["Strength"].default_value = strength
    bpy.context.scene.world = w


def setup_render(w, h, transparent, samples=96):
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE"
    s.render.resolution_x, s.render.resolution_y = w, h
    s.render.resolution_percentage = 100
    s.render.film_transparent = transparent
    try:
        s.eevee.taa_render_samples = samples
        s.eevee.use_raytracing = True
        s.eevee.use_shadows = True
    except Exception:
        pass
    try:
        s.view_settings.view_transform = "AgX"
        s.view_settings.look = "AgX - Punchy"
    except Exception:
        pass


def add_glow(strength=0.6):
    """Bloom via compositor glare. API differs across Blender versions, so it's best-effort."""
    s = bpy.context.scene
    try:
        tree = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
        s.compositing_node_group = tree
        rl = tree.nodes.new("CompositorNodeRLayers")
        out = tree.nodes.new("NodeGroupOutput")
        tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        glare = tree.nodes.new("CompositorNodeGlare")
        for key, val in (("Type", "Fog Glow"), ("Quality", "High")):
            if key in glare.inputs:
                glare.inputs[key].default_value = val
        if "Strength" in glare.inputs:
            glare.inputs["Strength"].default_value = strength
        if "Threshold" in glare.inputs:
            glare.inputs["Threshold"].default_value = 0.9
        tree.links.new(rl.outputs["Image"], glare.inputs["Image"])
        tree.links.new(glare.outputs["Image"], out.inputs[0])
        return True
    except Exception as e:
        print("glow skipped:", e)
        return False


def render(path):
    s = bpy.context.scene
    s.render.filepath = path
    if path.endswith(".png"):
        s.render.image_settings.file_format = "PNG"
        s.render.image_settings.color_mode = "RGBA"
    else:
        s.render.image_settings.file_format = "JPEG"
        s.render.image_settings.quality = 90
    bpy.ops.render.render(write_still=True)
    print("WROTE", path)


# ---------------------------------------------------------------- icon
def render_icon():
    reset()
    root, die, faces, numbers = build_d20()
    cam_loc = Vector((0, -6.2, 0.9))
    aim_face_at(root, faces, numbers, 20, cam_loc - Vector((0, 0, 0)), twist_deg=8)
    root.rotation_euler.rotate(Matrix.Rotation(math.radians(-14), 3, "Z").to_euler())
    camera(cam_loc, (0, 0, 0), lens=88)
    area_light("Key", (-4, -3, 4), (0, 0, 0), 900, (1.0, 0.72, 0.45), 3)
    area_light("Rim", (3.5, 3, 2.5), (0, 0, 0), 650, (0.55, 0.65, 1.0), 3)
    area_light("Fill", (2, -4, -1.5), (0, 0, 0), 150, (1.0, 0.5, 0.3), 4)
    world((0.02, 0.015, 0.03), 0.4)
    setup_render(1024, 1024, transparent=True, samples=128)
    add_glow(0.5)
    render(os.path.join(OUT, "icon.png"))


# ---------------------------------------------------------------- title
def ember_material():
    return mat_principled("Ember", (1.0, 0.4, 0.1), rough=1.0, emit=(1.0, 0.42, 0.1), emit_strength=18.0)


def slate_material():
    m = mat_principled("Slate", (0.03, 0.025, 0.028), rough=0.35)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 12.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
    rr = nt.nodes.new("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = 0.2
    rr.inputs["To Max"].default_value = 0.6
    nt.links.new(noise.outputs["Fac"], rr.inputs["Value"])
    nt.links.new(rr.outputs["Result"], p.inputs["Roughness"])
    return m


def render_title():
    reset()
    root, die, faces, numbers = build_d20(radius=0.55)
    # rest the die on the slate with a face down, then show 20 toward the camera-ish
    cam_loc = Vector((-1.9, -4.6, 0.95))
    aim_face_at(root, faces, numbers, 20, Vector((-0.35, -1.0, 0.7)), twist_deg=-10)
    root.location = (0.55, 0.0, 0.48)

    # a second, smaller die out of focus in the background
    root2, die2, f2, n2 = build_d20(radius=0.3)
    aim_face_at(root2, f2, n2, 17, Vector((0.3, -1.0, 0.6)), twist_deg=20)
    root2.location = (2.4, 2.6, 0.26)

    bpy.ops.mesh.primitive_plane_add(size=300, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.data.materials.append(slate_material())

    # embers: small glowing specks drifting upward, many out of focus
    em = ember_material()
    for i in range(140):
        loc = Vector((random.uniform(-4, 6), random.uniform(-2.5, 8), random.uniform(0.1, 3.5)))
        r = random.uniform(0.006, 0.022)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=8, ring_count=6)
        e = bpy.context.active_object
        e.data.materials.append(em)

    focus = bpy.data.objects.new("Focus", None)
    bpy.context.collection.objects.link(focus)
    focus.location = root.location
    camera(cam_loc, (-0.45, 0.7, 0.62), lens=50, dof_obj=focus, fstop=1.6)

    area_light("Key", (-2.5, -1.5, 2.8), (0.5, 0, 0.4), 420, (1.0, 0.6, 0.32), 1.5)
    area_light("Rim", (2.0, 3.0, 2.6), (0.5, 0, 0.4), 300, (0.45, 0.55, 1.0), 1.0)
    area_light("Glow", (3, 5, 0.4), (0, 0, 0.4), 260, (1.0, 0.32, 0.08), 3)
    world((0.006, 0.005, 0.01), 0.15)

    # light volumetric haze
    try:
        wnt = bpy.context.scene.world.node_tree
        vol = wnt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Density"].default_value = 0.006
        vol.inputs["Color"].default_value = (0.9, 0.7, 0.6, 1)
        wnt.links.new(vol.outputs["Volume"], wnt.nodes["World Output"].inputs["Volume"])
    except Exception as e:
        print("haze skipped:", e)

    setup_render(2560, 1440, transparent=False, samples=128)
    add_glow(0.7)
    render(os.path.join(OUT, "title.jpg"))


if WHICH in ("icon", "all"):
    render_icon()
if WHICH in ("title", "all"):
    render_title()
