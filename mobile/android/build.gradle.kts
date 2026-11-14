allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// Route the entire gradle build tree onto an APFS volume. The project's own
// drive is exFAT, which emits AppleDouble (._*) sidecars for every write
// and trips AGP's res parser. `/Volumes/fitmonk-build` is an APFS sparse
// image mounted from the same drive — see mobile/README.md for how it's
// created. Falls back to the on-tree build/ dir if the image isn't mounted,
// so contributors on APFS-native machines don't need to know about it.
val apfsBuildRoot: java.io.File = java.io.File("/Volumes/fitmonk-build/gradle")
val buildRoot: java.io.File =
    if (apfsBuildRoot.parentFile?.exists() == true) apfsBuildRoot
    else rootProject.layout.buildDirectory.dir("../../build").get().asFile
rootProject.layout.buildDirectory.set(buildRoot)

subprojects {
    project.layout.buildDirectory.set(java.io.File(buildRoot, project.name))
}
subprojects {
    project.evaluationDependsOn(":app")
}

// This project is stored on a non-APFS volume (exFAT/HFS+) that generates
// macOS AppleDouble sidecar files (._*). AGP's res parser hard-rejects them.
// Sweep both the source tree and the intermediates for every subproject
// before any parse* task runs, and once after every task, so freshly-emitted
// sidecars don't survive to trip the next task.
subprojects {
    tasks.matching { it.name.startsWith("parse") && it.name.endsWith("LocalResources") }
        .configureEach {
            doFirst {
                fileTree(project.projectDir) { include("**/._*") }.forEach { it.delete() }
                fileTree(project.layout.buildDirectory) { include("**/._*") }.forEach { it.delete() }
            }
        }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
